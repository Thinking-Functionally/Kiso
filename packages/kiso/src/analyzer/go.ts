// core.async `go` blocks: a CPS transform over analyzed Nodes, shared by the JS and AS backends.
//
// Every parking operation (`<!`, `>!`, `alts!`) becomes a callback-taking runtime call, and the rest
// of the block becomes the callback. The output uses only plain closures/let/letfn/if, so neither
// backend needs special support. Loops that contain a park become a recursive local function whose
// `recur` goes through the scheduler (`go-dispatch`), which keeps the stack flat.

import type { Node } from './node.js';

type K = (v: Node) => Node;
type Env = { loop: string | null };

let counter = 0;
const gensym = (p: string): string => `${p}__go${++counter}`;
const core = (name: string): Node => ({ type: 'var-ref', name, local: false });
const local = (name: string): Node => ({ type: 'var-ref', name, local: true });
const fn1 = (params: string[], body: Node): Node => ({ type: 'fn', name: null, arities: [{ params, restParam: null, body }] });
const call = (f: Node, args: Node[]): Node => ({ type: 'invoke', fn: f, args });
const letOne = (name: string, init: Node, body: Node): Node => ({ type: 'let', bindings: [{ name, init }], body });

const PARK = new Set(['<!', '>!', 'alts!']);
const isPark = (n: Node): boolean => n.type === 'invoke' && n.fn.type === 'var-ref' && !n.fn.local && PARK.has(n.fn.name);
const isTrivial = (n: Node): boolean => n.type === 'literal' || n.type === 'var-ref' || n.type === 'keyword';

/** Does evaluating `n` park, or `recur` into an enclosing parking loop (`rec`)? Never looks inside fn bodies. */
function needs(n: Node, rec: boolean): boolean {
  const any = (xs: Node[]): boolean => xs.some((x) => needs(x, rec));
  switch (n.type) {
    case 'invoke': return isPark(n) || needs(n.fn, rec) || any(n.args);
    case 'vector': case 'set': case 'js-array': return any(n.items);
    case 'map': return any(n.keys) || any(n.vals);
    case 'js-object': return any(n.vals);
    case 'if': return needs(n.test, rec) || needs(n.then, rec) || needs(n.else, rec);
    case 'do': return any(n.statements) || needs(n.ret, rec);
    case 'let': return n.bindings.some((b) => needs(b.init, rec)) || needs(n.body, rec);
    case 'letfn': return needs(n.body, rec);
    case 'loop': return n.bindings.some((b) => needs(b.init, rec)) || needs(n.body, false);
    case 'recur': return rec || any(n.args);
    case 'throw': return needs(n.expr, rec);
    case 'new': return any(n.args);
    case 'interop-call': return needs(n.target, rec) || any(n.args);
    case 'interop-field': return needs(n.target, rec);
    case 'set!': return needs(n.target, rec) || needs(n.value, rec);
    case 'case*': return needs(n.test, rec) || n.clauses.some((c) => needs(c.then, rec)) || needs(n.default, rec);
    case 'try': return needs(n.body, rec) || n.catches.some((c) => needs(c.body, rec)) || (n.finally !== null && needs(n.finally, rec));
    case 'def': return n.init !== null && needs(n.init, rec);
    default: return false;
  }
}

/** Bind the continuation once, outside any scope the block introduces, so branches can share it. */
function withJoin(k: K, build: (k2: K) => Node): Node {
  const kn = gensym('k');
  const v = gensym('v');
  return letOne(kn, fn1([v], k(local(v))), build((x) => call(local(kn), [x])));
}

function trList(nodes: Node[], env: Env, cont: (vals: Node[]) => Node): Node {
  let last = -1;
  nodes.forEach((x, i) => { if (needs(x, env.loop !== null)) last = i; });
  if (last < 0) return cont(nodes);
  const step = (i: number, acc: Node[]): Node => {
    if (i >= nodes.length) return cont(acc);
    const nd = nodes[i]!;
    if (i > last) return step(i + 1, [...acc, nd]);
    return tr(nd, (v) => {
      if (i === last || isTrivial(v)) return step(i + 1, [...acc, v]);
      const t = gensym('t');
      return letOne(t, v, step(i + 1, [...acc, local(t)]));
    }, env);
  };
  return step(0, []);
}

function park(n: Node & { type: 'invoke' }, k: K, env: Env): Node {
  const op = (n.fn as { name: string }).name;
  const v = gensym('v');
  const cb = fn1([v], k(local(v)));
  return trList(n.args, env, (a) => {
    if (op === '<!') return call(core('take!'), [a[0]!, cb]);
    if (op === '>!') return call(core('put!'), [a[0]!, a[1]!, cb]);
    return call(core('go-alts'), [a[0]!, cb]);
  });
}

function tr(n: Node, k: K, env: Env): Node {
  if (!needs(n, env.loop !== null)) return k(n);
  switch (n.type) {
    case 'invoke':
      if (isPark(n)) return park(n, k, env);
      return trList([n.fn, ...n.args], env, ([f, ...a]) => k({ ...n, fn: f!, args: a }));
    case 'vector': case 'set': case 'js-array':
      return trList(n.items, env, (items) => k({ ...n, items }));
    case 'map':
      return trList([...n.keys, ...n.vals], env, (xs) => k({ ...n, keys: xs.slice(0, n.keys.length), vals: xs.slice(n.keys.length) }));
    case 'js-object':
      return trList(n.vals, env, (vals) => k({ ...n, vals }));
    case 'if':
      return withJoin(k, (k2) => tr(n.test, (t) => ({ type: 'if', test: t, then: tr(n.then, k2, env), else: tr(n.else, k2, env) }), env));
    case 'do': {
      const go = (i: number): Node => i >= n.statements.length
        ? tr(n.ret, k, env)
        : tr(n.statements[i]!, (v) => ({ type: 'do', statements: [v], ret: go(i + 1) }), env);
      return go(0);
    }
    case 'let':
      return withJoin(k, (k2) => {
        const go = (i: number): Node => i >= n.bindings.length
          ? tr(n.body, k2, env)
          : tr(n.bindings[i]!.init, (v) => letOne(n.bindings[i]!.name, v, go(i + 1)), env);
        return go(0);
      });
    case 'letfn':
      return withJoin(k, (k2) => ({ ...n, body: tr(n.body, k2, env) }));
    case 'loop': {
      const lf = gensym('loop');
      return withJoin(k, (k2) => ({
        type: 'letfn',
        bindings: [{ name: lf, init: fn1(n.bindings.map((b) => b.name), tr(n.body, k2, { loop: lf })) }],
        body: trList(n.bindings.map((b) => b.init), env, (vals) => call(local(lf), vals)),
      }));
    }
    case 'recur': {
      const lf = env.loop;
      if (lf === null) throw new Error('go: recur outside a parking loop');
      return trList(n.args, env, (vals) => call(core('go-dispatch'), [fn1([], call(local(lf), vals))]));
    }
    case 'case*':
      return withJoin(k, (k2) => tr(n.test, (t) => ({
        ...n,
        test: t,
        clauses: n.clauses.map((c) => ({ ...c, then: tr(c.then, k2, env) })),
        default: tr(n.default, k2, env),
      }), env));
    case 'throw':
      return tr(n.expr, (v) => ({ type: 'throw', expr: v }), env);
    case 'new':
      return trList(n.args, env, (args) => k({ ...n, args }));
    case 'interop-call':
      return trList([n.target, ...n.args], env, ([t, ...args]) => k({ ...n, target: t!, args }));
    case 'interop-field':
      return tr(n.target, (t) => k({ ...n, target: t }), env);
    case 'set!':
      return tr(n.value, (v) => k({ ...n, value: v }), env);
    default:
      throw new Error(`go: ${n.type} cannot contain a parking operation (<!, >!, alts!)`);
  }
}

/** Transform an analyzed `go` body into a call that starts it on the scheduler and returns its channel. */
export function goTransform(body: Node): Node {
  const done = gensym('done');
  return call(core('go-start'), [fn1([done], tr(body, (v) => call(local(done), [v]), { loop: null }))]);
}
