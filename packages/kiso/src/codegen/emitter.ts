// Emitter — Generates ES6 JavaScript from Node AST.
//
// Key design decisions (from CW knowledge):
// - Clojure truthiness: truthy(x) runtime helper
// - recur → while(true) + temp vars + continue
// - Multi-arity fn → switch(args.length)
// - Name munging for special characters

import type { Node, FnArity, LetBinding, CatchClause, CaseNode, DeftypeNode, DefrecordNode, ExtendTypeNode, ReifyNode } from '../analyzer/node.js';
import { isMacro } from '../analyzer/macros.js';

export type CodegenHelpers = {
  emit: (node: Node) => string;
  indent: string;
  deeper: () => CodegenHelpers;
  extractLiteral: (node: Node) => unknown | null;
  nsRef: (ns: string) => string;
};

export type CodegenHook = (args: Node[], helpers: CodegenHelpers) => string;

type EmitCtx = {
  loopBindings: string[] | null; // current loop/fn binding names for recur
  nsAliases?: Map<string, string>; // ns → alias (e.g. "su.core" → "su")
  indent: number; // indentation level (0 = top-level)
  hooks?: Map<string, CodegenHook>;
  runtimeAliases?: Map<string, string>; // munged-name → alias for collided imports
  autoImports?: Map<string, string>; // ns → auto-alias for hook-referenced namespaces
  declared?: Set<string>; // module-level names already declared with `let`
  renames?: Map<string, string>; // in-scope local name → JS identifier (set when a binding shadows)
  valueDefs?: Set<string>; // munged top-level defs whose init is not a fn (may hold a map/vector/set used as IFn)
  shadowNames?: Set<string>; // munged module-level names (user defs, runtime imports) a local must not shadow in its own init
};

const DEFAULT_CTX: EmitCtx = { loopBindings: null, nsAliases: new Map(), indent: 0 };

function ind(ctx: EmitCtx): string { return '  '.repeat(ctx.indent); }
function deeper(ctx: EmitCtx): EmitCtx { return { ...ctx, indent: ctx.indent + 1 }; }

let renameSeq = 0;

/** JS identifier for a new let-style binding; renamed when it would shadow a local or module-level name (avoids TDZ and closure capture bugs). */
function bindLocal(ctx: EmitCtx, renames: Map<string, string>, name: string): string {
  const base = munge(name);
  const js = renames.has(name) || ctx.shadowNames?.has(base) ? `${base}__${++renameSeq}` : base;
  renames.set(name, js);
  return js;
}

/** Context in which `names` (fn params, fields, catch bindings) refer to themselves, undoing outer renames. */
function scopeWith(ctx: EmitCtx, names: string[]): EmitCtx {
  const renames = new Map(ctx.renames);
  for (const n of names) renames.set(n, munge(n));
  return { ...ctx, renames };
}

function emitNode(node: Node, ctx: EmitCtx): string {
  switch (node.type) {
    case 'literal': return emitLiteral(node);
    case 'keyword': return emitKeyword(node);
    case 'var-ref': {
      // js/Foo → Foo (JS global reference)
      if (node.name.startsWith('js/')) return node.name.slice(3);
      // Resolve ns-qualified names using aliases: su.core/foo → su.foo
      const slashIdx = node.name.indexOf('/');
      if (slashIdx > 0) {
        const ns = node.name.slice(0, slashIdx);
        const local = node.name.slice(slashIdx + 1);
        if (JS_GLOBALS.has(ns) || RUNTIME_CLASSES.has(ns)) return `${ns}.${local}`;
        const alias = ctx.nsAliases?.get(ns);
        if (alias) return `${alias}.${munge(local)}`;
        // Check if ns is itself an alias (e.g. su/mount where su is alias for su.core)
        if (ctx.nsAliases) {
          for (const [, a] of ctx.nsAliases) {
            if (a === ns) return `${munge(ns)}.${munge(local)}`;
          }
        }
        // No explicit alias: auto-generate namespace import
        if (ctx.autoImports) {
          if (!ctx.autoImports.has(ns)) {
            ctx.autoImports.set(ns, ns.replace(/\./g, '_'));
          }
          return `${ctx.autoImports.get(ns)!}.${munge(local)}`;
        }
      }
      if (node.local) {
        const renamed = ctx.renames?.get(node.name);
        if (renamed) return renamed;
      }
      const munged = munge(node.name);
      // Use aliased import for runtime functions that collide with user defs
      if (!node.local && RUNTIME_FUNCTIONS.has(node.name) && ctx.runtimeAliases?.has(munged)) {
        return ctx.runtimeAliases.get(munged)!;
      }
      return munged;
    }
    case 'vector': return `vector(${node.items.map((n) => emitNode(n, ctx)).join(', ')})`;
    case 'map': return emitMap(node, ctx);
    case 'set': return `hashSet(${node.items.map((n) => emitNode(n, ctx)).join(', ')})`;
    case 'js-array': return `[${node.items.map((n: Node) => emitNode(n, ctx)).join(', ')}]`;
    case 'js-object': return `({${node.keys.map((k: string, i: number) => `${JSON.stringify(k)}: ${emitNode(node.vals[i]!, ctx)}`).join(', ')}})`;
    case 'invoke': return emitInvoke(node, ctx);
    case 'if': return emitIf(node, ctx);
    case 'do': return emitDo(node, ctx);
    case 'let': return emitLet(node, ctx);
    case 'letfn': return emitLetfn(node, ctx);
    case 'fn': return emitFn(node, ctx);
    case 'def': return emitDef(node, ctx);
    case 'recur': return emitRecur(node, ctx);
    case 'loop': return emitLoop(node, ctx);
    case 'throw': return emitThrow(node, ctx);
    case 'try': return emitTry(node, ctx);
    case 'new': return `new ${emitNode(node.ctor, ctx)}(${node.args.map((n) => emitNode(n, ctx)).join(', ')})`;
    case 'interop-call': return `${emitInteropTarget(node.target, ctx)}.${node.method}(${node.args.map((n) => emitNode(n, ctx)).join(', ')})`;
    case 'interop-field': return `${emitInteropTarget(node.target, ctx)}.${node.field}`;
    case 'set!': return `(${emitNode(node.target, ctx)} = ${emitNode(node.value, ctx)})`;
    case 'js-raw': return node.code;
    case 'case*': return emitCase(node, ctx);
    case 'deftype': return emitDeftype(node, ctx);
    case 'defrecord': return emitDefrecord(node, ctx);
    case 'extend-type': return emitExtendType(node, ctx);
    case 'reify': return emitReify(node, ctx);
    case 'ns': return emitNs(node);
  }
}

// Public API — delegates to emitNode with default context
export function emit(node: Node): string {
  return emitNode(node, DEFAULT_CTX);
}

export type TopLevelMapping = { genLine: number; nodeIndex: number };

/** Emit a complete module from a list of top-level nodes. */
export function emitModule(nodes: Node[], hooks?: Map<string, CodegenHook>): string {
  return emitModuleWithMappings(nodes, hooks).code;
}

/** Emit module and return per-node generated line positions. */
export function emitModuleWithMappings(nodes: Node[], hooks?: Map<string, CodegenHook>): { code: string; mappings: TopLevelMapping[] } {
  // Extract ns aliases for resolving qualified names
  const nsAliases = new Map<string, string>();
  for (const node of nodes) {
    if (node.type === 'ns') {
      for (const req of node.requires) {
        if (req.alias) nsAliases.set(req.ns, req.alias);
      }
    }
  }
  // Collect user-defined top-level names to detect collisions with runtime imports
  const userDefs = new Set<string>();
  const flat = flattenTopLevelDo(nodes);
  for (const node of flat) {
    if (node.type === 'def') userDefs.add(munge(node.name));
    if (node.type === 'deftype') { userDefs.add(node.name); userDefs.add(`_to_${node.name}`); }
    if (node.type === 'defrecord') { userDefs.add(node.name); userDefs.add(`_to_${node.name}`); userDefs.add(`map_to_${node.name}`); }
  }

  // `def` inside a function/do body assigns a module-level binding that must be declared once
  const nestedDefs = new Set<string>();
  for (const node of flat) if (node.type !== 'def') collectDefs(node, nestedDefs);
  for (const node of flat) if (node.type === 'def' && node.init) collectDefs(node.init, nestedDefs);
  const hoisted = [...nestedDefs].map(munge).filter((n) => !userDefs.has(n));
  for (const n of hoisted) userDefs.add(n);

  // Collect ns alias names (e.g. "str" from `:as str`) that will become `import * as str`
  const nsAliasNames = new Set<string>();
  for (const [, alias] of nsAliases) {
    nsAliasNames.add(alias);
  }

  // Detect runtime import collisions and build alias map
  const runtimeImports = collectRuntimeImports(nodes);
  const runtimeAliases = new Map<string, string>();
  for (const name of runtimeImports) {
    if (userDefs.has(name) || nsAliasNames.has(name)) {
      runtimeAliases.set(name, `_rt_${name}`);
    }
  }

  const autoImports = new Map<string, string>();
  const shadowNames = new Set<string>([...userDefs, ...runtimeImports]);
  const declared = new Set<string>();
  const valueDefs = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'def' && node.init && node.init.type !== 'fn') valueDefs.add(munge(node.name));
  }
  const ctx: EmitCtx = { loopBindings: null, nsAliases, indent: 0, hooks, runtimeAliases, autoImports, shadowNames, declared, valueDefs };

  // Extract the current ns name for resolving auto-import paths
  const currentNs = nodes.find(n => n.type === 'ns')?.name ?? '';

  const allSegments = nodes.map(n => emitTopLevelCtx(n, ctx));
  if (!runtimeImports.includes('ifn') && allSegments.some((seg) => seg.includes('ifn('))) {
    runtimeImports.push('ifn');
    runtimeImports.sort();
  }
  // Track which node indices produced non-empty output
  const segments: string[] = [];
  const nodeIndices: number[] = [];
  for (let i = 0; i < allSegments.length; i++) {
    if (allSegments[i]!.length > 0) {
      segments.push(allSegments[i]!);
      nodeIndices.push(i);
    }
  }

  // Auto-import runtime functions (with aliases for collisions)
  let importOffset = 0;
  const preambleLines: string[] = [];
  if (hoisted.length > 0) {
    preambleLines.push(`export let ${hoisted.join(', ')};`);
  }
  if (runtimeImports.length > 0) {
    const importParts = runtimeImports.map(name =>
      runtimeAliases.has(name) ? `${name} as ${runtimeAliases.get(name)!}` : name,
    );
    preambleLines.push(`import { ${importParts.join(', ')} } from '@clojurewasm/kiso/runtime';`);
  }

  // Auto-generate namespace imports for hook-referenced namespaces
  for (const [ns, alias] of autoImports) {
    const path = nsToPath(currentNs, ns);
    preambleLines.push(`import * as ${alias} from '${path}';`);
  }

  if (preambleLines.length > 0) {
    segments.unshift(preambleLines.join('\n'));
    importOffset = preambleLines.join('\n').split('\n').length + 1;
  }

  // Compute line offsets for each non-empty top-level node
  // Top-level forms are separated by blank lines (\n\n), so +1 for the blank line
  const mappings: TopLevelMapping[] = [];
  let genLine = importOffset;
  for (let i = 0; i < nodeIndices.length; i++) {
    mappings.push({ genLine, nodeIndex: nodeIndices[i]! });
    const segIdx = preambleLines.length > 0 ? i + 1 : i;
    genLine += segments[segIdx]!.split('\n').length + 1; // +1 for blank line separator
  }

  return { code: segments.join('\n\n'), mappings };
}

// Top-level `do` blocks (defprotocol/defmulti expansions) are emitted flat, so their defs are top-level defs.
function flattenTopLevelDo(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.type === 'do') out.push(...flattenTopLevelDo([...n.statements, n.ret]));
    else out.push(n);
  }
  return out;
}

function collectDefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) { for (const n of node) collectDefs(n, out); return; }
  if (node === null || typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  if (rec.type === 'def' && typeof rec.name === 'string') out.add(rec.name);
  for (const v of Object.values(rec)) if (typeof v === 'object') collectDefs(v, out);
}

function emitTopLevelCtx(node: Node, ctx: EmitCtx): string {
  if (node.type === 'def') {
    const init = node.init ? emitNode(node.init, ctx) : 'null';
    const prefix = node.doc ? formatJSDoc(node.doc, '') : '';
    const jsName = munge(node.name);
    if (ctx.declared?.has(jsName)) return `${prefix}${jsName} = ${init};`;
    ctx.declared?.add(jsName);
    return `${prefix}export let ${jsName} = ${init};`;
  }
  if (node.type === 'deftype') {
    const code = emitDeftype(node, ctx);
    const factoryName = `_to_${node.name}`;
    return `${code}\nexport { ${node.name}, ${factoryName} };`;
  }
  if (node.type === 'defrecord') {
    const code = emitDefrecord(node, ctx);
    const factoryName = `_to_${node.name}`;
    const mapFactoryName = `map_to_${node.name}`;
    return `${code}\nexport { ${node.name}, ${factoryName}, ${mapFactoryName} };`;
  }
  if (node.type === 'ns') {
    return emitNs(node);
  }
  // Flatten top-level do blocks (e.g. from defprotocol/defmulti macro expansion)
  if (node.type === 'do') {
    const parts = [...node.statements, node.ret]
      .filter((n) => n.type !== 'literal' || n.value !== null)
      .map((n) => emitTopLevelCtx(n, ctx));
    return parts.join('\n');
  }
  return `${emitNode(node, ctx)};`;
}

// -- Emitters --

function emitInteropTarget(target: Node, ctx: EmitCtx): string {
  const code = emitNode(target, ctx);
  // Numeric literals need parens to avoid `42.method()` ambiguity
  if (target.type === 'literal' && typeof target.value === 'number') return `(${code})`;
  return code;
}

function emitLiteral(node: { value: unknown; jsType: string }): string {
  if (node.value === null) return 'null';
  if (node.jsType === 'regex') {
    const escaped = String(node.value).replace(/(?<!\\)\//g, '\\/');
    return escaped === '' ? '/(?:)/' : `/${escaped}/`;
  }
  if (typeof node.value === 'string') return JSON.stringify(node.value);
  if (typeof node.value === 'bigint') return `${node.value}n`;
  return String(node.value);
}

function emitKeyword(node: { ns: string | null; name: string }): string {
  if (node.ns) {
    return `keyword(${JSON.stringify(node.name)}, ${JSON.stringify(node.ns)})`;
  }
  return `keyword(${JSON.stringify(node.name)})`;
}

function emitMap(node: { keys: Node[]; vals: Node[] }, ctx: EmitCtx): string {
  const kvs: string[] = [];
  for (let i = 0; i < node.keys.length; i++) {
    kvs.push(emitNode(node.keys[i]!, ctx));
    kvs.push(emitNode(node.vals[i]!, ctx));
  }
  return `hashMap(${kvs.join(', ')})`;
}

function makeHelpers(ctx: EmitCtx): CodegenHelpers {
  return {
    emit: (node: Node) => emitNode(node, ctx),
    indent: ind(ctx),
    deeper: () => makeHelpers(deeper(ctx)),
    extractLiteral: (node: Node) => node.type === 'literal' ? node.value : null,
    nsRef: (ns: string) => {
      const alias = ctx.nsAliases?.get(ns);
      if (alias) return alias;
      if (ctx.autoImports?.has(ns)) return ctx.autoImports.get(ns)!;
      // Auto-generate alias: "su.core" → "su_core"
      const autoAlias = ns.replace(/\./g, '_');
      ctx.autoImports?.set(ns, autoAlias);
      return autoAlias;
    },
  };
}

function emitInvoke(node: { fn: Node; args: Node[] }, ctx: EmitCtx): string {
  // Check codegen hooks for namespace-qualified invocations
  if (ctx.hooks && node.fn.type === 'var-ref') {
    const hook = ctx.hooks.get(node.fn.name);
    if (hook) return hook(node.args, makeHelpers(ctx));
  }
  // IFn dispatch: set/map/vector in fn position → invoke() wrapper
  if (node.fn.type === 'set' || node.fn.type === 'map' || node.fn.type === 'vector') {
    return `invoke(${emitNode(node.fn, ctx)}, ${node.args.map((n) => emitNode(n, ctx)).join(', ')})`;
  }
  // A local may hold a map/set/vector/keyword-like IFn; ifn() passes functions through
  const callee = (node.fn.type === 'var-ref' && (node.fn.local || ctx.valueDefs?.has(munge(node.fn.name)))) || node.fn.type === 'invoke' ? `ifn(${emitNode(node.fn, ctx)})` : emitNode(node.fn, ctx);
  return `${callee}(${node.args.map((n) => emitNode(n, ctx)).join(', ')})`;
}

function ifChainDepth(node: { test: Node; then: Node; else: Node }): number {
  let depth = 1;
  let cur = node.else;
  while (cur.type === 'if') {
    depth++;
    cur = (cur as { test: Node; then: Node; else: Node }).else;
  }
  return depth;
}

function emitIfChain(node: { test: Node; then: Node; else: Node }, ctx: EmitCtx): string {
  const inner = deeper(ctx);
  const i = ind(inner);
  const lines: string[] = [];
  let cur: Node = node as unknown as Node;
  while (cur.type === 'if') {
    const ifNode = cur as unknown as { test: Node; then: Node; else: Node };
    lines.push(`${i}if (truthy(${emitNode(ifNode.test, inner)})) return ${emitNode(ifNode.then, inner)};`);
    cur = ifNode.else;
  }
  lines.push(`${i}return ${emitNode(cur, inner)};`);
  return `(() => {\n${lines.join('\n')}\n${ind(ctx)}})()`;
}

function emitIf(node: { test: Node; then: Node; else: Node }, ctx: EmitCtx): string {
  // Deep if-chains (cond) → IIFE with early returns
  if (ifChainDepth(node) > 2) {
    return emitIfChain(node, ctx);
  }
  // Clojure truthiness: only nil and false are falsy
  const test = emitNode(node.test, ctx);
  const inner = deeper(ctx);
  const then = emitNode(node.then, inner);
  const els = emitNode(node.else, inner);
  const i = ind(inner);
  return `(truthy(${test})\n${i}? ${then}\n${i}: ${els})`;
}

function emitCase(node: CaseNode, ctx: EmitCtx): string {
  // case* → multi-line chained ternaries for readability
  const inner = deeper(ctx);
  const i = ind(inner);
  const test = emitNode(node.test, ctx);
  const defaultVal = emitNode(node.default, inner);
  if (node.clauses.length === 0) return defaultVal;
  const lines: string[] = [];
  for (const c of node.clauses) {
    const testVal = emitNode(c.test, inner);
    const thenVal = emitNode(c.then, inner);
    lines.push(`${test} === ${testVal} ? ${thenVal}`);
  }
  lines.push(defaultVal);
  return `(\n${i}${lines.join(`\n${i}: `)}\n${ind(ctx)})`;
}

function emitDo(node: { statements: Node[]; ret: Node }, ctx: EmitCtx): string {
  if (node.statements.length === 0) return emitNode(node.ret, ctx);
  const stmts = node.statements.map((n) => emitNode(n, ctx)).join(', ');
  return `(${stmts}, ${emitNode(node.ret, ctx)})`;
}

function emitLet(node: { bindings: LetBinding[]; body: Node }, ctx: EmitCtx): string {
  const renames = new Map(ctx.renames);
  const inner = { ...deeper(ctx), renames };
  const i = ind(inner);
  const bindings = node.bindings.map((b) => {
    const init = emitNode(b.init, inner);
    return `${i}let ${bindLocal(ctx, renames, b.name)} = ${init};`;
  }).join('\n');
  return `(() => {\n${bindings}\n${i}return ${emitNode(node.body, inner)};\n${ind(ctx)}})()`;
}

function emitLetfn(node: { bindings: LetBinding[]; body: Node }, ctx: EmitCtx): string {
  const inner = deeper(ctx);
  const i = ind(inner);
  const decls = node.bindings.map((b) => munge(b.name)).join(', ');
  const assigns = node.bindings.map(
    (b) => `${i}${munge(b.name)} = ${emitNode(b.init, inner)};`,
  ).join('\n');
  return `(() => {\n${i}let ${decls};\n${assigns}\n${i}return ${emitNode(node.body, inner)};\n${ind(ctx)}})()`;
}

function emitFn(node: { name: string | null; arities: FnArity[] }, outerCtx: EmitCtx): string {
  const name = node.name ? munge(node.name) : '';

  if (node.arities.length === 1) {
    const arity = node.arities[0]!;
    return emitSingleArity(name, arity, outerCtx);
  }

  // Multi-arity: switch on arguments.length
  const inner = deeper(outerCtx);
  const caseCtx = deeper(inner);
  const ci = ind(caseCtx);
  const bi = ind(deeper(caseCtx));
  const cases = node.arities.map((arity) => {
    const n = arity.params.length;
    const params = arity.params.map(munge).join(', ');
    const ctx: EmitCtx = { ...scopeWith(deeper(caseCtx), [...arity.params, ...(arity.restParam ? [arity.restParam] : [])]), loopBindings: arity.params };
    const body = emitFnBody(arity.body, ctx, bi);
    if (arity.restParam) {
      const rp = munge(arity.restParam);
      return `${ci}default: {\n${bi}let [${params}${params ? ', ' : ''}...${rp}] = __args;\n${bi}${rp} = restArgs(${rp});\n${bi}${body}\n${ci}}`;
    }
    return `${ci}case ${n}: {\n${bi}let [${params}] = __args;\n${bi}${body}\n${ci}}`;
  }).join('\n');

  const si = ind(inner);
  return `function ${name}(...__args) {\n${si}switch(__args.length) {\n${cases}\n${si}}\n${ind(outerCtx)}}`;
}

function containsRecur(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(containsRecur);
  if (node === null || typeof node !== 'object') return false;
  const rec = node as Record<string, unknown>;
  if (rec.type === 'recur') return true;
  if (rec.type === 'fn' || rec.type === 'loop') return false;
  return Object.values(rec).some((v) => typeof v === 'object' && containsRecur(v));
}

/** Function body statements; a body that recurs to the fn itself becomes a `while (true)` loop over the params. */
function emitFnBody(body: Node, ctx: EmitCtx, indent: string): string {
  if (!containsRecur(body)) return `return ${emitNode(body, ctx)};`;
  const inner = deeper(ctx);
  return `while (true) {\n${indent}  ${emitStmt(body, inner)}\n${indent}}`;
}

function emitSingleArity(name: string, arity: FnArity, outerCtx: EmitCtx): string {
  const params = arity.params.map(munge);
  if (arity.restParam) {
    params.push(`...${munge(arity.restParam)}`);
  }
  const inner = deeper(outerCtx);
  const ctx: EmitCtx = { ...scopeWith(inner, [...arity.params, ...(arity.restParam ? [arity.restParam] : [])]), loopBindings: arity.params };
  const body = emitFnBody(arity.body, ctx, ind(inner));
  const restInit = arity.restParam ? `${munge(arity.restParam)} = restArgs(${munge(arity.restParam)});\n${ind(inner)}` : '';
  return `function ${name}(${params.join(', ')}) {\n${ind(inner)}${restInit}${body}\n${ind(outerCtx)}}`;
}

function emitDeftype(node: DeftypeNode, ctx: EmitCtx): string {
  const inner = deeper(ctx);
  const ii = deeper(inner);
  const i = ind(inner);
  const i2 = ind(ii);
  const name = node.name;
  const fields = node.fields.map(munge);
  const ctorParams = fields.join(', ');
  const ctorBody = fields.map((f) => `${i2}this.${f} = ${f};`).join('\n');
  const members: string[] = [];
  members.push(`${i}constructor(${ctorParams}) {\n${ctorBody}\n${i}}`);
  for (const impl of node.protocols) {
    const protoVar = emitNode(impl.protocol, ctx);
    for (const m of impl.methods) {
      const mParams = m.params.slice(1).map(munge);
      const self = m.params[0] ? munge(m.params[0]) : 'this_';
      const mctx = scopeWith(ii, [...m.params, ...node.fields]);
      const unpack = [`const ${self} = this;`, ...node.fields.map((f) => `const ${munge(f)} = this.${munge(f)};`)].map((l) => `${i2}${l}\n`).join('');
      const body = emitNode(m.body, mctx);
      members.push(`${i}[${protoVar}.methods.${m.name}](${mParams.join(', ')}) {\n${unpack}${i2}return ${body};\n${i}}`);
    }
  }
  const factoryName = `_to_${name}`;
  return `class ${name} {\n${members.join('\n\n')}\n}\nfunction ${factoryName}(${ctorParams}) {\n${i}return new ${name}(${ctorParams});\n}`;
}

function emitDefrecord(node: DefrecordNode, ctx: EmitCtx): string {
  const inner = deeper(ctx);
  const ii = deeper(inner);
  const i = ind(inner);
  const i2 = ind(ii);
  const name = node.name;
  const fields = node.fields.map(munge);
  const ctorParams = fields.join(', ');
  const ctorBody = fields.map((f) => `${i2}this.${f} = ${f};`).join('\n');
  const typeAssign = `${i2}this.__kiso_type = "${name}";`;
  const members: string[] = [];
  members.push(`${i}static __kiso_fields = [${node.fields.map((f) => JSON.stringify(f)).join(', ')}];`);
  members.push(`${i}constructor(${ctorParams}) {\n${ctorBody}\n${typeAssign}\n${i}}`);
  for (const impl of node.protocols) {
    const protoVar = emitNode(impl.protocol, ctx);
    for (const m of impl.methods) {
      const mParams = m.params.slice(1).map(munge);
      const self = m.params[0] ? munge(m.params[0]) : 'this_';
      const mctx = scopeWith(ii, [...m.params, ...node.fields]);
      const unpack = [`const ${self} = this;`, ...node.fields.map((f) => `const ${munge(f)} = this.${munge(f)};`)].map((l) => `${i2}${l}\n`).join('');
      const body = emitNode(m.body, mctx);
      members.push(`${i}[${protoVar}.methods.${m.name}](${mParams.join(', ')}) {\n${unpack}${i2}return ${body};\n${i}}`);
    }
  }
  const factoryName = `_to_${name}`;
  const mapFactoryName = `map_to_${name}`;
  const mapFactoryParams = fields.map((f) => `keyword("${f}")`);
  const mapFactoryBody = fields.map((_f, idx) => `m.get(${mapFactoryParams[idx]})`).join(', ');

  return [
    `class ${name} {\n${members.join('\n\n')}\n}`,
    `function ${factoryName}(${ctorParams}) {\n${i}return new ${name}(${ctorParams});\n}`,
    `function ${mapFactoryName}(m) {\n${i}return new ${name}(${mapFactoryBody});\n}`,
  ].join('\n');
}

function emitReify(node: ReifyNode, ctx: EmitCtx): string {
  // ({ [Proto.methods.m]() { return ...; }, ... })
  const methods: string[] = [];
  for (const impl of node.protocols) {
    const protoVar = emitNode(impl.protocol, ctx);
    for (const m of impl.methods) {
      const mParams = m.params.slice(1).map(munge); // skip 'this'
      const self = m.params[0] ? munge(m.params[0]) : 'this_';
      const body = emitNode(m.body, scopeWith(ctx, m.params));
      methods.push(`[${protoVar}.methods.${m.name}](${mParams.join(', ')}) { const ${self} = this; return ${body}; }`);
    }
  }
  return `({ ${methods.join(', ')} })`;
}

function emitExtendType(node: ExtendTypeNode, ctx: EmitCtx): string {
  const target = emitNode(node.target, ctx);
  const isNil = node.target.type === 'literal' && node.target.value === null;
  const stmts: string[] = [];
  for (const impl of node.protocols) {
    const protoVar = emitNode(impl.protocol, ctx);
    for (const m of impl.methods) {
      const mParams = m.params.slice(1).map(munge); // skip 'this'
      const self = m.params[0] ? munge(m.params[0]) : 'this_';
      const body = emitNode(m.body, scopeWith(ctx, m.params));
      const fnJs = `function(${mParams.join(', ')}) { const ${self} = this; return ${body}; }`;
      if (isNil) stmts.push(`(${protoVar}.nil ??= {})[${protoVar}.methods.${m.name}] = ${fnJs}`);
      else stmts.push(`${target}.prototype[${protoVar}.methods.${m.name}] = ${fnJs}`);
    }
  }
  return `(${stmts.join(', ')})`;
}

function emitThrow(node: { expr: Node }, ctx: EmitCtx): string {
  const inner = deeper(ctx);
  const i = ind(inner);
  return `(() => {\n${i}throw ${emitNode(node.expr, inner)};\n${ind(ctx)}})()`;
}

function formatJSDoc(doc: string, indent: string): string {
  // Escape */ to prevent premature comment close
  const safe = doc.replace(/\*\//g, '*\\/');
  const lines = safe.split('\n');
  if (lines.length === 1) return `/** ${safe} */\n${indent}`;
  return `/**\n${lines.map(l => `${indent} * ${l}`).join('\n')}\n${indent} */\n${indent}`;
}

function emitDef(node: { name: string; init: Node | null; doc: string | null }, ctx: EmitCtx): string {
  const init = node.init ? emitNode(node.init, ctx) : 'null';
  const prefix = node.doc ? formatJSDoc(node.doc, ind(ctx)) : '';
  // Standalone emit of a def node declares it; inside a module a nested def assigns the hoisted binding.
  if (!ctx.declared) return `${prefix}let ${munge(node.name)} = ${init}`;
  return `(${prefix}${munge(node.name)} = ${init})`;
}

function emitLoop(node: { bindings: LetBinding[]; body: Node }, ctx: EmitCtx): string {
  const inner = deeper(ctx);
  const ii = deeper(inner);
  const i = ind(inner);
  const i2 = ind(ii);
  const names = node.bindings.map((b) => b.name);
  // Bindings are parameters of nested arrows, so an init such as (seq xs) still sees the outer `xs`
  // (a `let xs` in the same scope would be in its temporal dead zone). recur reassigns the parameters.
  const scopes: Map<string, string>[] = [];
  const cur = new Map(ctx.renames);
  for (const n of names) {
    scopes.push(new Map(cur));
    cur.set(n, munge(n));
  }
  const loopCtx: EmitCtx = { ...ii, loopBindings: names, renames: cur };
  const body = emitStmt(node.body, loopCtx);
  let out = `(() => {\n${i}while (true) {\n${i2}${body}\n${i}}\n${ind(ctx)}})()`;
  for (let k = node.bindings.length - 1; k >= 0; k--) {
    const b = node.bindings[k]!;
    const argCtx: EmitCtx = { ...(k === 0 ? ctx : inner), renames: scopes[k] };
    out = `((${munge(b.name)}) => ${out})(${emitNode(b.init, argCtx)})`;
  }
  return out;
}

/** Emit a node as a statement that may contain recur. */
function emitStmt(node: Node, ctx: EmitCtx): string {
  const i = ind(ctx);
  const inner = deeper(ctx);
  const ii = ind(inner);
  // For if nodes in statement position, emit as if/else blocks
  if (node.type === 'if') {
    const test = emitNode(node.test, ctx);
    const thenStmt = emitStmt(node.then, inner);
    const elseStmt = emitStmt(node.else, inner);
    return `if (truthy(${test})) {\n${ii}${thenStmt}\n${i}} else {\n${ii}${elseStmt}\n${i}}`;
  }
  if (node.type === 'recur') {
    return emitRecurStmt(node, ctx);
  }
  if (node.type === 'do') {
    const stmts = node.statements.map((n) => `${emitNode(n, ctx)};`).join('\n' + i);
    const ret = emitStmt(node.ret, ctx);
    return `${stmts}\n${i}${ret}`;
  }
  if (node.type === 'let') {
    const renames = new Map(ctx.renames);
    const lctx = { ...ctx, renames };
    const bindings = node.bindings.map((b) => {
      const init = emitNode(b.init, lctx);
      return `const ${bindLocal(ctx, renames, b.name)} = ${init};`;
    }).join('\n' + i);
    return `${bindings}\n${i}${emitStmt(node.body, lctx)}`;
  }
  if (node.type === 'letfn') {
    const decls = node.bindings.map((b) => munge(b.name)).join(', ');
    const assigns = node.bindings.map(
      (b) => `${munge(b.name)} = ${emitNode(b.init, ctx)};`,
    ).join('\n' + i);
    return `let ${decls};\n${i}${assigns}\n${i}${emitStmt(node.body, ctx)}`;
  }
  // Default: return the expression
  return `return ${emitNode(node, ctx)};`;
}

function emitRecur(node: { args: Node[] }, ctx: EmitCtx): string {
  // recur as expression — shouldn't normally happen in well-formed code
  // but fall through for safety
  const assigns = node.args.map((a) => emitNode(a, ctx));
  return `/* recur */ (${assigns.join(', ')})`;
}

function emitRecurStmt(node: { args: Node[] }, ctx: EmitCtx): string {
  const names = ctx.loopBindings;
  if (!names) return `/* recur without loop */ continue;`;

  const i = ind(ctx);
  const args = node.args.map((a) => emitNode(a, ctx));

  // Use temp variables for simultaneous assignment
  const temps = names.map((n, idx) => `const ${munge(n)}__tmp = ${args[idx]};`);
  const assigns = names.map((n) => `${munge(n)} = ${munge(n)}__tmp;`);
  return [...temps, ...assigns, 'continue;'].join('\n' + i);
}

function emitTry(
  node: { body: Node; catches: CatchClause[]; finally: Node | null },
  ctx: EmitCtx,
): string {
  const inner = deeper(ctx);
  const ii = deeper(inner);
  const i = ind(inner);
  const i2 = ind(ii);
  const body = emitNode(node.body, inner);
  let catchBlock = '';
  if (node.catches.length > 0) {
    if (node.catches.length === 1 && node.catches[0]!.exType === ':default') {
      const c = node.catches[0]!;
      catchBlock = ` catch (${munge(c.binding)}) {\n${i2}return ${emitNode(c.body, scopeWith(ii, [c.binding]))};\n${i}}`;
    } else {
      const catchVar = 'catch__auto';
      const branches = node.catches.map((c) => {
        const bindingName = munge(c.binding);
        const bodyExpr = emitNode(c.body, scopeWith(ii, [c.binding]));
        if (c.exType === ':default') {
          return `{\n${i2}let ${bindingName} = ${catchVar};\n${i2}return ${bodyExpr};\n${i}}`;
        }
        const typeName = c.exType.startsWith('js/') ? c.exType.slice(3) : munge(c.exType);
        return `if (${catchVar} instanceof ${typeName}) {\n${i2}let ${bindingName} = ${catchVar};\n${i2}return ${bodyExpr};\n${i}}`;
      });
      const chain = branches.join(' else ');
      catchBlock = ` catch (${catchVar}) {\n${i}${chain}\n${i}throw ${catchVar};\n${i}}`;
    }
  }
  let finallyBlock = '';
  if (node.finally) {
    finallyBlock = ` finally {\n${i2}${emitNode(node.finally, ii)};\n${i}}`;
  }
  return `(() => {\n${i}try {\n${i2}return ${body};\n${i}}${catchBlock}${finallyBlock}\n${ind(ctx)}})()`;
}

function emitNs(node: { name: string; requires: { ns: string; alias: string | null; refers: string[] }[] }): string {
  const lines: string[] = [];
  for (const req of node.requires) {
    const path = nsToPath(node.name, req.ns);
    if (req.alias) {
      lines.push(`import * as ${munge(req.alias)} from '${path}';`);
    }
    const runtimeRefers = req.refers.filter(r => !isMacro(r));
    if (runtimeRefers.length > 0) {
      const names = runtimeRefers.map(munge).join(', ');
      lines.push(`import { ${names} } from '${path}';`);
    }
    if (!req.alias && runtimeRefers.length === 0) {
      lines.push(`import '${path}';`);
    }
  }
  return lines.join('\n');
}

/** Map a Clojure ns to a JS module path relative to the current ns. */
function nsToPath(currentNs: string, targetNs: string): string {
  // ClojureScript convention: hyphens in namespace → underscores in filesystem
  const currentParts = currentNs.split('.').map(p => p.replace(/-/g, '_'));
  const targetParts = targetNs.split('.').map(p => p.replace(/-/g, '_'));

  // Check if same top-level package
  if (currentParts[0] === targetParts[0]) {
    // Relative path: strip common prefix, then navigate
    let common = 0;
    while (common < currentParts.length - 1 && common < targetParts.length - 1
      && currentParts[common] === targetParts[common]) {
      common++;
    }
    const ups = currentParts.length - 1 - common;
    const prefix = ups === 0 ? './' : '../'.repeat(ups);
    const rest = targetParts.slice(common).join('/');
    return `${prefix}${rest}.js`;
  }

  // Different package: use full dotted→slashed path
  return `${targetParts.join('/')}.js`;
}

// -- Runtime Import Collection --

const RUNTIME_FUNCTIONS = new Set([
  'chan', 'buffer', 'dropping-buffer', 'sliding-buffer', 'take!', 'put!', 'close!', 'offer!', 'timeout', 'go-start', 'go-dispatch', 'go-alts',
  'atom', 'deref', 'reset!', 'swap!', 'isAtom',
  'cons', 'first', 'rest', 'count', 'list', 'seq', 'next',
  'conj', 'get', 'assoc', 'dissoc', 'into', 'concat',
  'str', 'map', 'filter', 'reduce', 'apply',
  'identity', 'constantly', 'comp', 'partial',
  'not', 'nil?', 'some?', 'empty?',
  'inc', 'dec', 'zero?', 'pos?', 'neg?',
  'number?', 'string?', 'boolean?',
  'equiv', 'symbol', 'name',
  '=', 'not=', '-', '+', '*', '/', 'mod',
  '>', '<', '>=', '<=',
  'defprotocol', 'protocolFn',
  'defmultiFn',
  'clj->js', 'js->clj', 'bean', 'js-obj', 'js-array', 'into-array', 'to-array',
  // Map operations
  'get-in', 'assoc-in', 'update', 'update-in',
  'keys', 'vals', 'merge', 'select-keys', 'find',
  // Numeric
  'max', 'min', 'abs', 'even?', 'odd?', 'rem', 'rand', 'rand-int',
  // Seq operations
  'take', 'drop', 'take-while', 'drop-while',
  'some', 'every?', 'not-every?', 'not-any?',
  'sort', 'sort-by', 'reverse',
  'range', 'repeat', 'repeatedly',
  'group-by', 'frequencies',
  // Predicates
  'fn?', 'integer?', 'coll?', 'sequential?', 'associative?', 'identical?',
  // Higher-order
  'complement', 'juxt', 'every-pred', 'some-fn', 'memoize',
  // Printing
  'println', 'print', 'capture-out',
  // Collection access
  'nth', 'second', 'last', 'butlast', 'peek', 'pop', 'subvec', 'not-empty',
  // Seq batch 2
  'mapcat', 'map-indexed', 'remove', 'keep',
  'flatten', 'distinct', 'dedupe',
  'interleave', 'interpose',
  'partition', 'partition-all', 'partition-by',
  'merge-with', 'zipmap', 'reduce-kv',
  // Regex
  're-find', 're-matches', 're-seq',
  // Misc
  'fnil', 'trampoline',
  // Navigation
  'ffirst', 'fnext', 'nfirst', 'nnext',
  'take-last', 'take-nth', 'drop-last', 'keep-indexed', 'reductions',
  // Generators
  'iterate', 'cycle', 'doall', 'dorun',
  // empty / set
  'empty', 'set',
  // Predicates batch 2
  'float?', 'ifn?', 'counted?', 'realized?',
  // Numeric
  'quot', 'compare',
  // Array interop
  'aget', 'aset', 'alength', 'js-keys',
  // Batch 4
  '==', 're-pattern', 'regexp?',
  'pr-str', 'prn-str', 'print-str', 'println-str',
  'array', 'aclone', 'js-delete',
  'hash', 'type', 'instance?',
  'restArgs', 'StackOverflowError', 'Throwable', 'Exception', 'ex-info', 'ex-message', 'ex-data',
  'prn', 'pr',
  'reversible?', 'sorted?',
  'satisfies?', 'implements?',
  // Sorted collections
  'sorted-map', 'sorted-set',
  'sorted-map-by', 'sorted-set-by', 'sorted-map?', 'sorted-set?', 'comparator', 'subseq', 'rsubseq',
  // Transient collections
  'transient', 'persistent!', 'conj!', 'assoc!', 'dissoc!', 'disj!',
  // Metadata
  'meta', 'with-meta', 'vary-meta', 'alter-meta!', 'reset-meta!',
  // I4: contains? and subs
  'contains?', 'subs',
  // I3: IFn invoke for sets/maps/vectors in fn position
  'invoke',
  // Transducer support
  'transduce', 'completing', 'reduced', 'reduced?', 'unreduced', 'ensure-reduced',
  // extras.ts
  'vec', 'mapv', 'vector?', 'list?', 'true?', 'false?', 'boolean', 'hash-map', 'hash-set', 'keyword?', 'symbol?', 'map?', 'set?', 'int', 'long', 'short',
  'bit-and', 'bit-or', 'bit-xor', 'bit-not', 'bit-shift-left', 'bit-shift-right', 'distinct?', 'disj',
  'ifn', 'LazySeq', 'read-string', 'char', 'char?', 'min-key', 'max-key', 'split-at', 'split-with', 'sequence', 'rseq', 'shuffle', 'key', 'val', 'namespace',
]);

/** Scan AST for runtime function usage and return needed import names. */
function collectRuntimeImports(nodes: Node[]): string[] {
  const used = new Set<string>();
  for (const node of nodes) {
    scanNodeForRuntime(node, used);
  }
  return [...used].sort();
}

function scanNodeForRuntime(node: Node, used: Set<string>): void {
  switch (node.type) {
    case 'vector': {
      used.add('vector');
      for (const item of node.items) scanNodeForRuntime(item, used);
      break;
    }
    case 'map': {
      used.add('hashMap');
      for (const k of node.keys) scanNodeForRuntime(k, used);
      for (const v of node.vals) scanNodeForRuntime(v, used);
      break;
    }
    case 'set': {
      used.add('hashSet');
      for (const item of node.items) scanNodeForRuntime(item, used);
      break;
    }
    case 'js-array': {
      for (const item of node.items) scanNodeForRuntime(item, used);
      break;
    }
    case 'js-object': {
      for (const v of node.vals) scanNodeForRuntime(v, used);
      break;
    }
    case 'keyword': {
      used.add('keyword');
      break;
    }
    case 'var-ref': {
      if (!node.local && RUNTIME_FUNCTIONS.has(node.name)) {
        used.add(munge(node.name));
      }
      const slash = node.name.indexOf('/');
      if (!node.local && slash > 0 && RUNTIME_CLASSES.has(node.name.slice(0, slash))) used.add(node.name.slice(0, slash));
      break;
    }
    case 'invoke': {
      // Detect runtime function calls by name
      if (node.fn.type === 'var-ref' && !node.fn.local) {
        const name = node.fn.name;
        if (RUNTIME_FUNCTIONS.has(name)) used.add(munge(name));
      }
      // IFn dispatch: set/map/vector in fn position needs invoke
      if (node.fn.type === 'set' || node.fn.type === 'map' || node.fn.type === 'vector') {
        used.add('invoke');
      }
      if ((node.fn.type === 'var-ref' && node.fn.local) || node.fn.type === 'invoke') used.add('ifn');
      scanNodeForRuntime(node.fn, used);
      for (const a of node.args) scanNodeForRuntime(a, used);
      break;
    }
    case 'if': {
      used.add('truthy');
      scanNodeForRuntime(node.test, used);
      scanNodeForRuntime(node.then, used);
      scanNodeForRuntime(node.else, used);
      break;
    }
    case 'do': {
      for (const s of node.statements) scanNodeForRuntime(s, used);
      scanNodeForRuntime(node.ret, used);
      break;
    }
    case 'let': case 'letfn': case 'loop': {
      for (const b of node.bindings) scanNodeForRuntime(b.init, used);
      scanNodeForRuntime(node.body, used);
      break;
    }
    case 'fn': {
      for (const a of node.arities) {
        if (a.restParam) used.add('restArgs');
        scanNodeForRuntime(a.body, used);
      }
      break;
    }
    case 'def': {
      if (node.init) scanNodeForRuntime(node.init, used);
      break;
    }
    case 'throw': {
      scanNodeForRuntime(node.expr, used);
      break;
    }
    case 'try': {
      scanNodeForRuntime(node.body, used);
      for (const c of node.catches) {
        if (RUNTIME_FUNCTIONS.has(c.exType)) used.add(munge(c.exType));
        scanNodeForRuntime(c.body, used);
      }
      if (node.finally) scanNodeForRuntime(node.finally, used);
      break;
    }
    case 'new': {
      scanNodeForRuntime(node.ctor, used);
      for (const a of node.args) scanNodeForRuntime(a, used);
      break;
    }
    case 'interop-call': {
      scanNodeForRuntime(node.target, used);
      for (const a of node.args) scanNodeForRuntime(a, used);
      break;
    }
    case 'interop-field': {
      scanNodeForRuntime(node.target, used);
      break;
    }
    case 'set!': {
      scanNodeForRuntime(node.target, used);
      scanNodeForRuntime(node.value, used);
      break;
    }
    case 'recur': {
      for (const a of node.args) scanNodeForRuntime(a, used);
      break;
    }
    case 'case*': {
      scanNodeForRuntime(node.test, used);
      for (const c of node.clauses) {
        scanNodeForRuntime(c.test, used);
        scanNodeForRuntime(c.then, used);
      }
      scanNodeForRuntime(node.default, used);
      break;
    }
    case 'deftype': case 'defrecord': case 'extend-type': case 'reify': {
      if ('target' in node) scanNodeForRuntime(node.target, used);
      for (const impl of node.protocols) {
        scanNodeForRuntime(impl.protocol, used);
        for (const m of impl.methods) scanNodeForRuntime(m.body, used);
      }
      break;
    }
    // literal, var-ref, js-raw, ns: no runtime needed
  }
}

// -- Name Munging --

const RUNTIME_CLASSES = new Set(['Character', 'Integer', 'Long', 'Double']);
const JS_GLOBALS = new Set(['Math', 'JSON', 'Number', 'String', 'Object', 'Array', 'Date', 'Promise', 'Symbol', 'Reflect', 'BigInt']);

const JS_RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export',
  'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'await',
  'implements', 'interface', 'package', 'private', 'protected', 'public', 'arguments', 'eval',
]);

export function munge(name: string): string {
  const out = mungeRaw(name);
  return JS_RESERVED.has(out) ? `${out}_` : out;
}

function mungeRaw(name: string): string {
  // Standalone operators → readable names
  switch (name) {
    case '-': return 'subtract';
    case '/': return 'divide';
    case '+': return 'add';
    case '*': return 'multiply';
    case '=': return 'eq';
    case '==': return 'num_eq';
    case 'not=': return 'notEq';
    case 'type': return 'type_fn';
    case '<': return 'lt';
    case '>': return 'gt';
    case '<=': return 'lte';
    case '>=': return 'gte';
  }
  // Earmuffs: *foo* → _foo_ (but lone * is handled above)
  const earmuffed = name.replace(/^\*(.+)\*$/, '_$1_');
  if (earmuffed !== name) {
    return earmuffed.replace(/-/g, '_');
  }
  return name
    .replace(/\//g, '.')
    .replace(/->/g, '_to_')
    .replace(/-/g, '_')
    .replace(/\?/g, '_p')
    .replace(/!/g, '_m')
    .replace(/\*/g, '_STAR_')
    .replace(/\+/g, '_PLUS_')
    .replace(/>/g, '_GT_')
    .replace(/</g, '_LT_')
    .replace(/=/g, '_eq_')
    .replace(/'/g, '_SINGLEQUOTE_')
    .replace(/&/g, '_AMPERSAND_')
    .replace(/%/g, '_PCT_');
}
