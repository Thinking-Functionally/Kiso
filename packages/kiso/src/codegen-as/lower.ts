// AS lowering pass: analyzer Node[] -> LModule (see lowered.ts, design/08-assemblyscript-backend.md).
//
// - flattens expression-position if/let/try/loop/case into statements + temps (M1.8)
// - closure conversion: by-value captures, resolved through enclosing functions (M1.6)
// - tail-position analysis: recur becomes assign + continue, validated via sinks (M1.7)
// - multi-arity / variadic fns become explicit arities (M1.9)

import type { Node, FnNode, ProtocolImplNode, CaseNode } from '../analyzer/node.js';
import { checkSupported, AsUnsupportedError, rewriteDotimesRaw } from './supported.js';
import type {
  LModule, LFunction, LArity, LExpr, LStmt, LVar, LClosure, LProtocolImpl, LCatch,
} from './lowered.js';

export { AsUnsupportedError };

type Sink =
  | { kind: 'return' }
  | { kind: 'assign'; name: string }
  | { kind: 'loop-exit'; result: string };

type RecurTarget = { vars: string[]; used: boolean };

type ModState = { functions: (LFunction | null)[]; nodeIndex: number };

class FnScope {
  scopes: Map<string, string>[] = [new Map()];
  used = new Set<string>();
  captures = new Map<string, LVar>();
  tempN = 0;
  constructor(
    public parent: FnScope | null,
    public selfName: string | null = null,
    public fields: Set<string> = new Set(),
  ) {}

  push(): void { this.scopes.push(new Map()); }
  pop(): void { this.scopes.pop(); }

  declare(name: string): string {
    let u = name;
    let n = 0;
    while (this.used.has(u)) u = `${name}__${++n}`;
    this.used.add(u);
    this.scopes[this.scopes.length - 1]!.set(name, u);
    return u;
  }

  temp(): string {
    const u = `__t${this.tempN++}`;
    this.used.add(u);
    return u;
  }

  resolve(name: string): LVar {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const u = this.scopes[i]!.get(name);
      if (u !== undefined) return { type: 'var', name: u, kind: 'local' };
    }
    if (this.fields.has(name)) return { type: 'var', name, kind: 'field' };
    if (this.selfName === name) return { type: 'var', name, kind: 'self' };
    if (!this.parent) return { type: 'var', name, kind: 'global' };
    const src = this.parent.resolve(name);
    if (src.kind === 'global') return src;
    if (!this.captures.has(src.name)) this.captures.set(src.name, src);
    return { type: 'var', name: src.name, kind: 'captured' };
  }
}

type Ctx = { fs: FnScope; mod: ModState };

const NIL: LExpr = { type: 'literal', value: null, jsType: 'null' };

function fail(ctx: Ctx, construct: string, reason: string): never {
  throw new AsUnsupportedError(construct, ctx.mod.nodeIndex, reason);
}

export function lowerModule(nodes: Node[]): LModule {
  checkSupported(nodes);
  const mod: ModState = { functions: [], nodeIndex: 0 };
  const ctx: Ctx = { fs: new FnScope(null), mod };
  const body: LStmt[] = [];
  nodes.forEach((n, i) => {
    mod.nodeIndex = i;
    discard(expr(n, body, ctx), body);
  });
  return { functions: mod.functions as LFunction[], body };
}

function discard(e: LExpr, out: LStmt[]): void {
  if (e.type === 'invoke' || e.type === 'host-call' || e.type === 'new') out.push({ type: 'expr', expr: e });
}

function isAtomic(e: LExpr): boolean {
  return e.type === 'literal' || e.type === 'keyword' || (e.type === 'var' && e.kind !== 'global');
}

/** Lower nodes left-to-right; earlier results are spilled if a later node emits statements. */
function exprs(nodes: Node[], out: LStmt[], ctx: Ctx, headIsCallee = false): LExpr[] {
  const results: LExpr[] = [];
  for (const n of nodes) {
    let at = out.length;
    const e = expr(n, out, ctx);
    if (out.length > at) {
      for (let i = 0; i < results.length; i++) {
        // A global callee is resolved at call time, so it never needs a temp
        if (isAtomic(results[i]!) || (headIsCallee && i === 0)) continue;
        const t = ctx.fs.temp();
        out.splice(at++, 0, { type: 'let', name: t, init: results[i]! });
        results[i] = { type: 'var', name: t, kind: 'local' };
      }
    }
    results.push(e);
  }
  return results;
}

function tempVar(ctx: Ctx, out: LStmt[]): { name: string; ref: LExpr } {
  const name = ctx.fs.temp();
  out.push({ type: 'let', name, init: null });
  return { name, ref: { type: 'var', name, kind: 'local' } };
}

function expr(node: Node, out: LStmt[], ctx: Ctx): LExpr {
  switch (node.type) {
    case 'literal':
      return { type: 'literal', value: node.value, jsType: node.jsType };
    case 'keyword':
      return { type: 'keyword', ns: node.ns, name: node.name };
    case 'var-ref':
      return ctx.fs.resolve(node.name);
    case 'js-raw': {
      const rewritten = rewriteDotimesRaw(node.code);
      if (!rewritten) throw new Error(`js-raw is not supported in AssemblyScript: ${node.code}`);
      return expr(rewritten, out, ctx);
    }
    case 'vector':
      return { type: 'vector', items: exprs(node.items, out, ctx) };
    case 'set':
      return { type: 'set', items: exprs(node.items, out, ctx) };
    case 'map': {
      const flat = exprs(node.keys.flatMap((k, i) => [k, node.vals[i]!]), out, ctx);
      return {
        type: 'map',
        keys: flat.filter((_, i) => i % 2 === 0),
        vals: flat.filter((_, i) => i % 2 === 1),
      };
    }
    case 'invoke': {
      if (node.fn.type === 'var-ref' && node.fn.name.startsWith('host/')) {
        return { type: 'host-call', name: node.fn.name, args: exprs(node.args, out, ctx) };
      }
      const [fn, ...args] = exprs([node.fn, ...node.args], out, ctx, true);
      return { type: 'invoke', fn: fn!, args };
    }
    case 'new': {
      const [ctor, ...args] = exprs([node.ctor, ...node.args], out, ctx);
      return { type: 'new', ctor: ctor!, args };
    }
    case 'fn':
      return lowerFn(node, ctx, new Set());
    case 'do': {
      node.statements.forEach((s) => discard(expr(s, out, ctx), out));
      return expr(node.ret, out, ctx);
    }
    case 'let': {
      ctx.fs.push();
      for (const b of node.bindings) {
        const init = expr(b.init, out, ctx);
        out.push({ type: 'let', name: ctx.fs.declare(b.name), init });
      }
      const r = expr(node.body, out, ctx);
      ctx.fs.pop();
      return r;
    }
    case 'def': {
      const value = node.init ? expr(node.init, out, ctx) : null;
      out.push({ type: 'def', name: node.name, value, doc: node.doc });
      return { type: 'var', name: node.name, kind: 'global' };
    }
    case 'throw': {
      out.push({ type: 'throw', value: expr(node.expr, out, ctx) });
      return NIL;
    }
    case 'set!': {
      const target = node.target;
      if (target.type !== 'var-ref') return fail(ctx, 'set!', 'only assignment to vars is supported');
      let v = expr(node.value, out, ctx);
      if (!isAtomic(v)) {
        const t = tempVar(ctx, out);
        out.push({ type: 'assign', name: t.name, value: v });
        v = t.ref;
      }
      const dst = ctx.fs.resolve(target.name);
      if (dst.kind === 'global') out.push({ type: 'set-global', name: dst.name, value: v });
      else if (dst.kind === 'local') out.push({ type: 'assign', name: dst.name, value: v });
      else return fail(ctx, 'set!', `cannot assign to ${dst.kind} variable ${target.name}`);
      return v;
    }
    case 'recur':
      return fail(ctx, 'recur', 'recur must be in tail position');
    case 'reify':
      return { type: 'reify', protocols: lowerImpls(node.protocols, new Set(), out, ctx) };
    case 'deftype':
    case 'defrecord': {
      out.push({
        type: 'type-def',
        kind: node.type,
        name: node.name,
        fields: node.fields,
        protocols: lowerImpls(node.protocols, new Set(node.fields), out, ctx),
      });
      return NIL;
    }
    case 'extend-type': {
      const target = expr(node.target, out, ctx);
      out.push({ type: 'extend-type', target, protocols: lowerImpls(node.protocols, new Set(), out, ctx) });
      return NIL;
    }
    case 'ns':
      out.push({ type: 'ns', name: node.name, requires: node.requires });
      return NIL;
    case 'if':
    case 'letfn':
    case 'loop':
    case 'try':
    case 'case*': {
      const t = tempVar(ctx, out);
      tail(node, out, ctx, { kind: 'assign', name: t.name }, null);
      return t.ref;
    }
    default:
      return fail(ctx, node.type, 'unexpected node');
  }
}

function deliver(sink: Sink, v: LExpr, out: LStmt[]): void {
  switch (sink.kind) {
    case 'return':
      out.push({ type: 'return', value: v });
      return;
    case 'assign':
      out.push({ type: 'assign', name: sink.name, value: v });
      return;
    case 'loop-exit':
      out.push({ type: 'assign', name: sink.result, value: v });
      out.push({ type: 'break' });
      return;
  }
}

/** Lower `node` so its value is delivered to `sink`. `recur` is allowed only if non-null. */
function tail(node: Node, out: LStmt[], ctx: Ctx, sink: Sink, recur: RecurTarget | null): void {
  switch (node.type) {
    case 'if': {
      const test = expr(node.test, out, ctx);
      const then: LStmt[] = [];
      const els: LStmt[] = [];
      tail(node.then, then, ctx, sink, recur);
      tail(node.else, els, ctx, sink, recur);
      out.push({ type: 'if', test, then, else: els });
      return;
    }
    case 'do':
      node.statements.forEach((s) => discard(expr(s, out, ctx), out));
      return tail(node.ret, out, ctx, sink, recur);
    case 'let':
      ctx.fs.push();
      for (const b of node.bindings) {
        const init = expr(b.init, out, ctx);
        out.push({ type: 'let', name: ctx.fs.declare(b.name), init });
      }
      tail(node.body, out, ctx, sink, recur);
      ctx.fs.pop();
      return;
    case 'letfn': {
      ctx.fs.push();
      const names = node.bindings.map((b) => ctx.fs.declare(b.name));
      const bindings = node.bindings.map((b, i) => {
        if (b.init.type !== 'fn') return fail(ctx, 'letfn', 'binding must be a fn');
        return { name: names[i]!, closure: lowerFn(b.init, ctx, new Set()) };
      });
      out.push({ type: 'letfn', bindings });
      tail(node.body, out, ctx, sink, recur);
      ctx.fs.pop();
      return;
    }
    case 'loop': {
      ctx.fs.push();
      const vars: string[] = [];
      for (const b of node.bindings) {
        const init = expr(b.init, out, ctx);
        const u = ctx.fs.declare(b.name);
        vars.push(u);
        out.push({ type: 'let', name: u, init });
      }
      const result = tempVar(ctx, out);
      const body: LStmt[] = [];
      tail(node.body, body, ctx, { kind: 'loop-exit', result: result.name }, { vars, used: false });
      out.push({ type: 'loop', body });
      ctx.fs.pop();
      deliver(sink, result.ref, out);
      return;
    }
    case 'recur': {
      if (!recur) return fail(ctx, 'recur', 'recur must be in tail position');
      if (node.args.length !== recur.vars.length) {
        return fail(ctx, 'recur', `expected ${recur.vars.length} arguments, got ${node.args.length}`);
      }
      const args = exprs(node.args, out, ctx);
      const temps = args.map((a) => {
        if (a.type === 'literal' || a.type === 'keyword') return a;
        const t = ctx.fs.temp();
        out.push({ type: 'let', name: t, init: a });
        return { type: 'var', name: t, kind: 'local' } as LVar;
      });
      recur.vars.forEach((v, i) => out.push({ type: 'assign', name: v, value: temps[i]! }));
      out.push({ type: 'continue' });
      recur.used = true;
      return;
    }
    case 'case*':
      return lowerCase(node, out, ctx, sink, recur);
    case 'try': {
      const body: LStmt[] = [];
      tail(node.body, body, ctx, sink, null);
      const catches: LCatch[] = node.catches.map((c) => {
        ctx.fs.push();
        const binding = ctx.fs.declare(c.binding);
        const cb: LStmt[] = [];
        tail(c.body, cb, ctx, sink, null);
        ctx.fs.pop();
        return { exType: c.exType, binding, body: cb };
      });
      let finalizer: LStmt[] | null = null;
      if (node.finally) {
        finalizer = [];
        discard(expr(node.finally, finalizer, ctx), finalizer);
      }
      out.push({ type: 'try', body, catches, finalizer });
      return;
    }
    case 'throw':
      out.push({ type: 'throw', value: expr(node.expr, out, ctx) });
      return;
    default:
      deliver(sink, expr(node, out, ctx), out);
  }
}

function lowerCase(node: CaseNode, out: LStmt[], ctx: Ctx, sink: Sink, recur: RecurTarget | null): void {
  let subject = expr(node.test, out, ctx);
  if (!isAtomic(subject)) {
    const t = ctx.fs.temp();
    out.push({ type: 'let', name: t, init: subject });
    subject = { type: 'var', name: t, kind: 'local' };
  }
  const build = (i: number, into: LStmt[]): void => {
    if (i >= node.clauses.length) return tail(node.default, into, ctx, sink, recur);
    const c = node.clauses[i]!;
    const [cv] = exprs([c.test], into, ctx);
    const then: LStmt[] = [];
    const els: LStmt[] = [];
    tail(c.then, then, ctx, sink, recur);
    build(i + 1, els);
    into.push({
      type: 'if',
      test: { type: 'invoke', fn: { type: 'var', name: '=', kind: 'global' }, args: [subject, cv!] },
      then,
      else: els,
    });
  };
  build(0, out);
}

function lowerImpls(impls: ProtocolImplNode[], fields: Set<string>, out: LStmt[], ctx: Ctx): LProtocolImpl[] {
  return impls.map((impl) => ({
    protocol: expr(impl.protocol, out, ctx),
    methods: impl.methods.map((m) => ({
      name: m.name,
      fn: lowerFnArities(m.name, [{ params: m.params, restParam: null, body: m.body }], ctx, fields),
    })),
  }));
}

function lowerFn(node: FnNode, ctx: Ctx, fields: Set<string>): LClosure {
  return lowerFnArities(node.name, node.arities, ctx, fields);
}

function lowerFnArities(
  name: string | null,
  arities: FnNode['arities'],
  ctx: Ctx,
  fields: Set<string>,
): LClosure {
  const id = ctx.mod.functions.length;
  ctx.mod.functions.push(null);
  const fs = new FnScope(ctx.fs, name, fields);
  const inner: Ctx = { fs, mod: ctx.mod };

  const lowered: LArity[] = arities.map((a) => {
    fs.push();
    const params = a.params.map((p) => fs.declare(p));
    const restParam = a.restParam ? fs.declare(a.restParam) : null;
    const target: RecurTarget = { vars: restParam ? [...params, restParam] : params, used: false };
    const body: LStmt[] = [];
    tail(a.body, body, inner, { kind: 'return' }, target);
    fs.pop();
    return { params, restParam, body: target.used ? [{ type: 'loop', body }] : body };
  });

  ctx.mod.functions[id] = {
    id,
    name,
    captures: [...fs.captures.keys()],
    fields: [...fields],
    arities: lowered,
  };
  return {
    type: 'closure',
    fnId: id,
    captures: [...fs.captures.entries()].map(([n, source]) => ({ name: n, source })),
  };
}
