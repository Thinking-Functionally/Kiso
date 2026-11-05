// AS lowering pass (M1, in progress). Currently: rejects JS-only constructs.
// Consumes analyzer Node[] read-only; see .dev/design/08-assemblyscript-backend.md.

import type { Node, ProtocolImplNode } from '../analyzer/node.js';

export class AsUnsupportedError extends Error {
  constructor(
    public readonly construct: string,
    public readonly nodeIndex: number,
    reason: string,
  ) {
    super(`AssemblyScript backend: ${construct} is not supported (${reason})`);
    this.name = 'AsUnsupportedError';
  }
}

export function checkSupported(nodes: Node[]): Node[] {
  nodes.forEach((n, i) => checkNode(n, i));
  return nodes;
}

function unsupported(construct: string, idx: number, reason: string): never {
  throw new AsUnsupportedError(construct, idx, reason);
}

/** The only raw JS the AS backend accepts: the counters that the `dotimes` macro expands to. */
export function rewriteDotimesRaw(code: string): Node | null {
  const local = (name: string): Node => ({ type: 'var-ref', name, local: true });
  const core = (name: string): Node => ({ type: 'var-ref', name, local: false });
  const lt = /^(\w+) < (\w+)$/.exec(code);
  if (lt) return { type: 'invoke', fn: core('<'), args: [local(lt[1]!), local(lt[2]!)] };
  const inc = /^(\w+) \+ 1$/.exec(code);
  if (inc) return { type: 'invoke', fn: core('+'), args: [local(inc[1]!), { type: 'literal', value: 1, jsType: 'number' }] };
  return null;
}

function checkImpls(impls: ProtocolImplNode[], idx: number): void {
  for (const impl of impls) {
    checkNode(impl.protocol, idx);
    for (const m of impl.methods) checkNode(m.body, idx);
  }
}

function checkNode(node: Node, idx: number): void {
  const walk = (n: Node): void => checkNode(n, idx);
  switch (node.type) {
    case 'js-raw':
      if (rewriteDotimesRaw(node.code)) return;
      return unsupported('js-raw', idx, 'raw JavaScript cannot be compiled to AssemblyScript');
    case 'js-array':
      return unsupported('js-array', idx, 'JS array literals are JS-only');
    case 'js-object':
      return unsupported('js-object', idx, 'JS object literals are JS-only');
    case 'interop-call':
      return unsupported('interop-call', idx, 'JS interop; use host/ functions instead');
    case 'interop-field':
      return unsupported('interop-field', idx, 'JS interop; use host/ functions instead');
    case 'new':
      if (node.ctor.type === 'var-ref' && node.ctor.name.startsWith('js/')) {
        return unsupported('new', idx, 'JS constructors are JS-only');
      }
      walk(node.ctor);
      node.args.forEach(walk);
      return;
    case 'set!':
      if (node.target.type !== 'var-ref' || node.target.name.startsWith('js/')) {
        return unsupported('set!', idx, 'only assignment to vars is supported');
      }
      return walk(node.value);
    case 'var-ref':
      if (node.name.startsWith('js/')) {
        return unsupported('js/ reference', idx, 'JS globals are not available');
      }
      return;
    case 'literal':
    case 'keyword':
    case 'ns':
      return;
    case 'vector':
    case 'set':
      return node.items.forEach(walk);
    case 'map':
      node.keys.forEach(walk);
      return node.vals.forEach(walk);
    case 'invoke':
      walk(node.fn);
      return node.args.forEach(walk);
    case 'if':
      walk(node.test);
      walk(node.then);
      return walk(node.else);
    case 'do':
      node.statements.forEach(walk);
      return walk(node.ret);
    case 'let':
    case 'letfn':
    case 'loop':
      node.bindings.forEach((b) => walk(b.init));
      return walk(node.body);
    case 'fn':
      return node.arities.forEach((a) => walk(a.body));
    case 'def':
      return node.init ? walk(node.init) : undefined;
    case 'recur':
      return node.args.forEach(walk);
    case 'throw':
      return walk(node.expr);
    case 'try':
      walk(node.body);
      node.catches.forEach((c) => walk(c.body));
      return node.finally ? walk(node.finally) : undefined;
    case 'case*':
      walk(node.test);
      node.clauses.forEach((c) => {
        walk(c.test);
        walk(c.then);
      });
      return walk(node.default);
    case 'deftype':
    case 'defrecord':
    case 'reify':
      return checkImpls(node.protocols, idx);
    case 'extend-type':
      walk(node.target);
      return checkImpls(node.protocols, idx);
  }
}
