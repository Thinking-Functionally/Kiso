// Lowered IR → AssemblyScript source (M2 subset).
//
// Every Kiso value is a `Value` (as-runtime/kiso-runtime.ts). Each LFunction becomes a
// class extending `Fn`; captures are constructor fields. Arities with <= 3 params
// override `callN`; `invoke(args)` dispatches on length.

import type { LExpr, LFunction, LModule, LStmt, LVar, LClosure } from './lowered.js';
import { AsUnsupportedError } from './supported.js';

export const RUNTIME_MODULE = './kiso-runtime';

export type EmitOptions = {
  /** Clojure def names to export through the numeric (f64) ABI; `-main` becomes `main(): void`. */
  exports?: string[];
};

const MAX_DIRECT = 3;

// Core ops compiled to direct runtime calls. `value` returns Value, `bool` returns native bool.
type CoreOp = { kind: 'value' | 'bool'; fn: string; arity: number | 'variadic' };
const CORE_OPS: Record<string, CoreOp> = {
  '/': { kind: 'value', fn: 'div', arity: 2 },
  '*': { kind: 'value', fn: 'mul', arity: 2 },
  inc: { kind: 'value', fn: 'inc', arity: 1 },
  dec: { kind: 'value', fn: 'dec', arity: 1 },
  mod: { kind: 'value', fn: 'mod', arity: 2 },
  rem: { kind: 'value', fn: 'rem', arity: 2 },
  '<': { kind: 'bool', fn: 'lt', arity: 2 },
  '>': { kind: 'bool', fn: 'gt', arity: 2 },
  '<=': { kind: 'bool', fn: 'lte', arity: 2 },
  '>=': { kind: 'bool', fn: 'gte', arity: 2 },
  '=': { kind: 'bool', fn: 'eq', arity: 2 },
  'zero?': { kind: 'bool', fn: 'isZero', arity: 1 },
  'pos?': { kind: 'bool', fn: 'isPos', arity: 1 },
  'neg?': { kind: 'bool', fn: 'isNeg', arity: 1 },
};

function unsupported(construct: string, reason: string): never {
  throw new AsUnsupportedError(construct, -1, reason);
}

/** Escape a Clojure name into a valid AS identifier fragment (injective). */
export function mangle(name: string): string {
  let out = '';
  for (const ch of name) {
    if (/[A-Za-z0-9]/.test(ch)) out += ch;
    else out += `_${ch.codePointAt(0)!.toString(16)}_`;
  }
  return out;
}

export function wasmExportName(name: string): string {
  const stripped = name.replace(/^-+/, '');
  const n = stripped.replace(/[^A-Za-z0-9_]/g, '_');
  return n.length > 0 ? n : '_';
}

class Emitter {
  private consts = new Map<string, string>();
  private constDecls: string[] = [];
  private globals = new Set<string>();
  private fnById = new Map<number, LFunction>();

  constructor(private mod: LModule) {
    for (const f of mod.functions) this.fnById.set(f.id, f);
    this.collectGlobals(mod.body);
  }

  private collectGlobals(stmts: LStmt[]): void {
    for (const s of stmts) {
      if (s.type === 'def') this.globals.add(s.name);
      else if (s.type === 'if') {
        this.collectGlobals(s.then);
        this.collectGlobals(s.else);
      } else if (s.type === 'loop') this.collectGlobals(s.body);
    }
  }

  // -- constants -------------------------------------------------------------

  private constant(key: string, init: string): string {
    let name = this.consts.get(key);
    if (!name) {
      name = `K${this.consts.size}`;
      this.consts.set(key, name);
      this.constDecls.push(`const ${name}: Value = ${init};`);
    }
    return name;
  }

  private literal(value: unknown, jsType: string): string {
    switch (jsType) {
      case 'null':
        return 'NIL';
      case 'boolean':
        return value ? 'TRUE' : 'FALSE';
      case 'number': {
        const n = value as number;
        const text = Number.isNaN(n) ? 'NaN' : n === Infinity ? 'Infinity' : n === -Infinity ? '-Infinity' : String(n);
        return this.constant(`n:${text}`, `new Num(${text})`);
      }
      case 'string':
        return this.constant(`s:${value as string}`, `new Str(${JSON.stringify(value)})`);
      default:
        return unsupported(`${jsType} literal`, 'only nil, boolean, number and string literals are supported in M2');
    }
  }

  // -- expressions -----------------------------------------------------------

  private varRef(v: LVar): string {
    switch (v.kind) {
      case 'local':
        return `l_${mangle(v.name)}`;
      case 'captured':
        return `this.c_${mangle(v.name)}`;
      case 'self':
        return 'this';
      case 'global':
        if (this.globals.has(v.name)) return `g_${mangle(v.name)}`;
        return unsupported(`var ${v.name}`, 'not defined in this module; core functions as values arrive in M3');
      case 'field':
        return unsupported('deftype field', 'deftype/defrecord arrive in M4');
    }
  }

  private coreOpFor(e: LExpr): { name: string; op: string } | null {
    if (e.type === 'var' && e.kind === 'global' && !this.globals.has(e.name)) return { name: e.name, op: e.name };
    return null;
  }

  private args(args: LExpr[]): string[] {
    return args.map((a) => this.expr(a));
  }

  private closure(c: LClosure): string {
    const fn = this.fnById.get(c.fnId)!;
    // Capture order is the fn's declared capture order
    const byName = new Map(c.captures.map((cap) => [cap.name, cap.source]));
    const ctorArgs = fn.captures.map((n) => this.varRef(byName.get(n)!));
    return `new Fn_${fn.id}(${ctorArgs.join(', ')})`;
  }

  /** AS expression of native `bool` type. */
  private cond(e: LExpr): string {
    if (e.type === 'invoke') {
      const core = this.coreOpFor(e.fn);
      if (core) {
        const op = CORE_OPS[core.op];
        if (op && op.kind === 'bool' && op.arity === e.args.length) {
          return `${op.fn}(${this.args(e.args).join(', ')})`;
        }
        if (core.op === 'not' && e.args.length === 1) return `!${this.cond(e.args[0]!)}`;
        if (core.op === 'not=' && e.args.length === 2) return `!eq(${this.args(e.args).join(', ')})`;
      }
    }
    if (e.type === 'literal' && e.jsType === 'boolean') return e.value ? 'true' : 'false';
    return `truthy(${this.expr(e)})`;
  }

  private invoke(e: Extract<LExpr, { type: 'invoke' }>): string {
    const core = this.coreOpFor(e.fn);
    if (core) return this.coreCall(core.op, e.args);
    const head = e.fn.type === 'var' && e.fn.kind === 'self' ? 'this' : `asFn(${this.expr(e.fn)})`;
    const a = this.args(e.args);
    if (a.length <= MAX_DIRECT) return `${head}.call${a.length}(${a.join(', ')})`;
    return `${head}.invoke([${a.join(', ')}])`;
  }

  private coreCall(name: string, args: LExpr[]): string {
    const a = this.args(args);
    switch (name) {
      case '+':
        if (a.length === 0) return this.literal(0, 'number');
        return a.reduce((acc, x) => `add(${acc}, ${x})`);
      case '-':
        if (a.length === 0) unsupported('-', 'requires at least one argument');
        if (a.length === 1) return `neg(${a[0]})`;
        return a.reduce((acc, x) => `sub(${acc}, ${x})`);
      case '*':
        if (a.length === 0) return this.literal(1, 'number');
        return a.reduce((acc, x) => `mul(${acc}, ${x})`);
      case 'not':
        if (a.length === 1) return `bool_(!truthy(${a[0]}))`;
        break;
      case 'not=':
        if (a.length === 2) return `bool_(!eq(${a[0]}, ${a[1]}))`;
        break;
      case 'println':
        return `println([${a.join(', ')}])`;
      case 'str':
        return `str([${a.join(', ')}])`;
      default: {
        const op = CORE_OPS[name];
        if (op && op.arity === a.length) {
          const call = `${op.fn}(${a.join(', ')})`;
          return op.kind === 'bool' ? `bool_(${call})` : call;
        }
      }
    }
    return unsupported(`(${name} …) with ${a.length} args`, 'unknown core function or arity in M2');
  }

  expr(e: LExpr): string {
    switch (e.type) {
      case 'literal':
        return this.literal(e.value, e.jsType);
      case 'keyword':
        return this.constant(`k:${e.ns ?? ''}/${e.name}`, `new Kw(${JSON.stringify(e.ns ?? '')}, ${JSON.stringify(e.name)})`);
      case 'var':
        return this.varRef(e);
      case 'invoke':
        return this.invoke(e);
      case 'closure':
        return this.closure(e);
      case 'host-call':
        return unsupported(`host/${e.name}`, 'host calls arrive in M3');
      case 'vector':
      case 'set':
      case 'map':
        return unsupported(`${e.type} literal`, 'persistent collections arrive in M3');
      case 'new':
        return unsupported('new', 'deftype/defrecord arrive in M4');
      case 'reify':
        return unsupported('reify', 'protocols arrive in M4');
    }
  }

  // -- statements ------------------------------------------------------------

  private stmts(list: LStmt[], indent: string): string[] {
    const out: string[] = [];
    for (const s of list) out.push(...this.stmt(s, indent));
    return out;
  }

  private stmt(s: LStmt, ind: string): string[] {
    switch (s.type) {
      case 'let':
        return [`${ind}let l_${mangle(s.name)}: Value = ${s.init ? this.expr(s.init) : 'NIL'};`];
      case 'assign':
        return [`${ind}l_${mangle(s.name)} = ${this.expr(s.value)};`];
      case 'set-global':
      case 'def': {
        if (s.type === 'set-global' && !this.globals.has(s.name)) unsupported(`set! ${s.name}`, 'unknown global');
        const value = s.type === 'def' ? (s.value ? this.expr(s.value) : 'NIL') : this.expr(s.value);
        return [`${ind}g_${mangle(s.name)} = ${value};`];
      }
      case 'expr':
        return [`${ind}${this.expr(s.expr)};`];
      case 'if':
        return [
          `${ind}if (${this.cond(s.test)}) {`,
          ...this.stmts(s.then, ind + '  '),
          s.else.length > 0 ? `${ind}} else {` : '',
          ...this.stmts(s.else, ind + '  '),
          `${ind}}`,
        ].filter((l) => l !== '');
      case 'loop':
        return [`${ind}while (true) {`, ...this.stmts(s.body, ind + '  '), `${ind}}`];
      case 'break':
        return [`${ind}break;`];
      case 'continue':
        return [`${ind}continue;`];
      case 'return':
        return [`${ind}return ${this.expr(s.value)};`];
      case 'throw':
        return [`${ind}throwValue(${this.expr(s.value)});`];
      case 'letfn': {
        const lines = s.bindings.map((b) => {
          const fn = this.fnById.get(b.closure.fnId)!;
          const nils = fn.captures.map(() => 'NIL').join(', ');
          return `${ind}let l_${mangle(b.name)}: Value = new Fn_${fn.id}(${nils});`;
        });
        for (const b of s.bindings) {
          const fn = this.fnById.get(b.closure.fnId)!;
          for (const cap of b.closure.captures) {
            lines.push(`${ind}changetype<Fn_${fn.id}>(l_${mangle(b.name)}).c_${mangle(cap.name)} = ${this.varRef(cap.source)};`);
          }
        }
        return lines;
      }
      case 'try':
        return unsupported('try', 'exceptions arrive in M3');
      case 'type-def':
        return unsupported(s.kind, 'deftype/defrecord arrive in M4');
      case 'extend-type':
        return unsupported('extend-type', 'protocols arrive in M4');
      case 'ns':
        if (s.requires.length > 0) unsupported('ns :require', 'module imports arrive in M5');
        return [];
    }
  }

  // -- functions -------------------------------------------------------------

  private fnClass(fn: LFunction): string[] {
    if (fn.fields.length > 0) unsupported('deftype method', 'deftype/defrecord arrive in M4');
    const caps = fn.captures.map((c) => `c_${mangle(c)}`);
    const lines: string[] = [`class Fn_${fn.id} extends Fn {`];
    if (caps.length > 0) {
      lines.push(`  constructor(${caps.map((c) => `public ${c}: Value`).join(', ')}) {`, '    super();', '  }');
    }
    const dispatch: string[] = [];
    for (const ar of fn.arities) {
      if (ar.restParam !== null) unsupported('rest parameter', '& rest arrives with collections in M3');
      const n = ar.params.length;
      const params = ar.params.map((p) => `l_${mangle(p)}: Value`).join(', ');
      const method = n <= MAX_DIRECT ? `call${n}` : `ar${n}`;
      const body = this.stmts(ar.body, '    ');
      const last = ar.body[ar.body.length - 1];
      if (!last || (last.type !== 'return' && last.type !== 'loop')) body.push('    return NIL;');
      else if (last.type === 'loop') body.push('    return NIL;');
      lines.push(`  ${method}(${params}): Value {`, ...body, '  }');
      dispatch.push(`      case ${n}: return this.${method}(${ar.params.map((_, i) => `args[${i}]`).join(', ')});`);
    }
    lines.push('  invoke(args: Array<Value>): Value {', '    switch (args.length) {', ...dispatch, '    }', '    return arityError();', '  }', '}');
    return lines;
  }

  private exportWrapper(name: string): string[] {
    const def = this.mod.body.find((s) => s.type === 'def' && s.name === name);
    if (!def || def.type !== 'def' || !def.value || def.value.type !== 'closure') {
      unsupported(`export ${name}`, 'only functions defined with defn/def+fn can be exported');
    }
    const fn = this.fnById.get((def.value as LClosure).fnId)!;
    const ar = fn.arities.filter((a) => a.restParam === null).sort((a, b) => b.params.length - a.params.length)[0];
    if (!ar) unsupported(`export ${name}`, 'function has no fixed arity');
    const wasm = wasmExportName(name);
    const call = (argNames: string[]) => {
      const a = argNames.map((n) => `new Num(${n})`);
      return a.length <= MAX_DIRECT ? `asFn(g_${mangle(name)}).call${a.length}(${a.join(', ')})` : `asFn(g_${mangle(name)}).invoke([${a.join(', ')}])`;
    };
    const names = ar.params.map((_, i) => `a${i}`);
    if (name === '-main' && ar.params.length === 0) {
      return [`export function ${wasm}(): void {`, `  ${call([])};`, '}'];
    }
    return [`export function ${wasm}(${names.map((n) => `${n}: f64`).join(', ')}): f64 {`, `  return toF64(${call(names)});`, '}'];
  }

  emit(exports: string[]): string {
    const fnClasses = this.mod.functions.flatMap((f) => [...this.fnClass(f), '']);
    const init = this.stmts(this.mod.body, '  ');
    const wrappers = exports.flatMap((n) => [...this.exportWrapper(n), '']);
    const header = [
      `import { Value, Fn, Num, Str, Kw, NIL, TRUE, FALSE, bool_, truthy, asFn, arityError, throwValue, toF64, add, sub, mul, div, neg, inc, dec, rem, mod, lt, gt, lte, gte, isZero, isPos, isNeg, eq, println, str } from "${RUNTIME_MODULE}";`,
      '',
    ];
    const globalDecls = [...this.globals].map((g) => `let g_${mangle(g)}: Value = NIL;`);
    return [
      ...header,
      ...this.constDecls,
      ...globalDecls,
      '',
      ...fnClasses,
      'function __kiso_init(): void {',
      ...init,
      '}',
      '',
      ...wrappers,
      '__kiso_init();',
      '',
    ].join('\n');
  }
}

export function emitAs(mod: LModule, opts: EmitOptions = {}): string {
  return new Emitter(mod).emit(opts.exports ?? []);
}
