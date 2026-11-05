// Lowered IR → AssemblyScript source (M2 subset).
//
// Every Kiso value is a `Value` (as-runtime/kiso-runtime.ts). Each LFunction becomes a
// class extending `Fn`; captures are constructor fields. Arities with <= 3 params
// override `callN`; `invoke(args)` dispatches on length.

import type { LExpr, LFunction, LModule, LStmt, LVar, LClosure } from './lowered.js';
import { AsUnsupportedError } from './supported.js';
import { mangle } from './mangle.js';
import { inferNumericLocals, isArithCall, isNumTyped } from './numeric-locals.js';
import { NumericCheck, emitNative, nativeName } from './numeric.js';

const MAX_DIRECT = 3;

export const RUNTIME_MODULE = './kiso-runtime';

export type EmitOptions = {
  /** Clojure def names to export through the numeric (f64) ABI; `-main` becomes `main(): void`. */
  exports?: string[];
};

// Core ops compiled to direct runtime calls. `value` returns Value, `bool` returns native bool.
type CoreOp = { kind: 'value' | 'bool'; fn: string; arity: number | number[]; sfx?: boolean };
const CORE_OPS: Record<string, CoreOp> = {
  '/': { kind: 'value', fn: 'div', arity: 2 },
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
  'even?': { kind: 'bool', fn: 'isEven', arity: 1 },
  'odd?': { kind: 'bool', fn: 'isOdd', arity: 1 },
  'nil?': { kind: 'bool', fn: 'isNil', arity: 1 },
  'some?': { kind: 'bool', fn: 'isSome', arity: 1 },
  'number?': { kind: 'bool', fn: 'isNumber', arity: 1 },
  'string?': { kind: 'bool', fn: 'isString', arity: 1 },
  'keyword?': { kind: 'bool', fn: 'isKeyword', arity: 1 },
  'vector?': { kind: 'bool', fn: 'isVector', arity: 1 },
  'map?': { kind: 'bool', fn: 'isMap', arity: 1 },
  'contains?': { kind: 'bool', fn: 'kcontains', arity: 2 },
  'empty?': { kind: 'bool', fn: 'kempty', arity: 1 },
  count: { kind: 'value', fn: 'kcount', arity: 1 },
  nth: { kind: 'value', fn: 'knth', arity: 2 },
  get: { kind: 'value', fn: 'kget', arity: 2 },
  dissoc: { kind: 'value', fn: 'kdissoc', arity: 2 },
  keys: { kind: 'value', fn: 'kkeys', arity: 1 },
  vals: { kind: 'value', fn: 'kvals', arity: 1 },
  first: { kind: 'value', fn: 'kfirst', arity: 1 },
  second: { kind: 'value', fn: 'ksecond', arity: 1 },
  last: { kind: 'value', fn: 'klast', arity: 1 },
  peek: { kind: 'value', fn: 'kpeek', arity: 1 },
  pop: { kind: 'value', fn: 'kpop', arity: 1 },
  vec: { kind: 'value', fn: 'kvec', arity: 1 },
  identity: { kind: 'value', fn: 'identity', arity: 1 },
  reduce: { kind: 'value', fn: 'kreduce', arity: [2, 3] },
  'get-in': { kind: 'value', fn: 'kgetIn', arity: [2, 3] },
  'set?': { kind: 'bool', fn: 'isSet', arity: 1 },
  'list?': { kind: 'bool', fn: 'isList', arity: 1 },
  'seq?': { kind: 'bool', fn: 'isSeq', arity: 1 },
  'every?': { kind: 'bool', fn: 'kevery', arity: 2 },
  set: { kind: 'value', fn: 'kset', arity: 1 },
  disj: { kind: 'value', fn: 'kdisj', arity: 2 },
  seq: { kind: 'value', fn: 'kseq', arity: 1 },
  rest: { kind: 'value', fn: 'krest', arity: 1 },
  next: { kind: 'value', fn: 'knext', arity: 1 },
  cons: { kind: 'value', fn: 'kcons', arity: 2 },
  empty: { kind: 'value', fn: 'kemptyOf', arity: 1 },
  reverse: { kind: 'value', fn: 'kreverse', arity: 1 },
  take: { kind: 'value', fn: 'ktake', arity: 2 },
  drop: { kind: 'value', fn: 'kdrop', arity: 2 },
  map: { kind: 'value', fn: 'kmap', arity: [2, 3], sfx: true },
  mapv: { kind: 'value', fn: 'kmapv', arity: 2 },
  filter: { kind: 'value', fn: 'kfilter', arity: 2 },
  filterv: { kind: 'value', fn: 'kfilterv', arity: 2 },
  remove: { kind: 'value', fn: 'kremove', arity: 2 },
  some: { kind: 'value', fn: 'ksome', arity: 2 },
  into: { kind: 'value', fn: 'kinto', arity: 2 },
  range: { kind: 'value', fn: 'krange', arity: [1, 2, 3], sfx: true },
  'ex-info': { kind: 'value', fn: 'kexInfo', arity: 2 },
  'ex-message': { kind: 'value', fn: 'kexMessage', arity: 1 },
  'ex-data': { kind: 'value', fn: 'kexData', arity: 1 },
};
// Runtime fns taking all arguments as one Array<Value>.
const ARRAY_OPS: Record<string, string> = { vector: 'vector', 'hash-map': 'hashMap', 'pr-str': 'prStr', prn: 'prn', println: 'println', str: 'str', list: 'klist', 'hash-set': 'hashSet', concat: 'kconcat' };

const HOST_FNS: Record<string, { fn: string; arity: number }> = {
  'host/args': { fn: 'hostArgs', arity: 0 },
  'host/env': { fn: 'hostEnvGet', arity: 1 },
  'host/read-file': { fn: 'hostReadFileV', arity: 1 },
  'host/write-file': { fn: 'hostWriteFileV', arity: 2 },
  'host/stdin': { fn: 'hostStdinV', arity: 0 },
  'host/exit': { fn: 'hostExitV', arity: 1 },
  'host/now': { fn: 'hostNowV', arity: 0 },
};

const RUNTIME_IMPORTS = [
  'hostArgs', 'hostEnvGet', 'hostReadFileV', 'hostWriteFileV', 'hostStdinV', 'hostExitV', 'hostNowV',
  'Value', 'Fn', 'Num', 'Str', 'Kw', 'NIL', 'TRUE', 'FALSE', 'bool_', 'truthy', 'asFn', 'arityError', 'throwValue', 'toF64', 'mkNum',
  'add', 'sub', 'mul', 'div', 'neg', 'inc', 'dec', 'rem', 'mod', 'lt', 'gt', 'lte', 'gte', 'isZero', 'isPos', 'isNeg', 'eq',
  'isEven', 'isOdd', 'isNil', 'isSome', 'isNumber', 'isString', 'isKeyword', 'isVector', 'isMap', 'identity',
  'mkVec', 'mkMap', 'EMPTY_VEC', 'EMPTY_MAP', 'vector', 'hashMap', 'kcount', 'kempty', 'kconj', 'kconjN', 'knth', 'knth3', 'kget', 'kget3', 'kassoc', 'kassocN',
  'kdissoc', 'kcontains', 'kkeys', 'kvals', 'kfirst', 'ksecond', 'klast', 'kpeek', 'kpop', 'kvec', 'kmax', 'kmin',
  'callV0', 'callV1', 'callV2', 'callV3', 'callVN', 'kreduce2', 'kreduce3', 'kupdate', 'kgetIn', 'kgetIn3',
  'println', 'prn', 'prStr', 'str',
  'SetV', 'ExInfo', 'EMPTY_SET', 'mkSet', 'hashSet', 'kset', 'kdisj', 'isSet', 'isList', 'isSeq', 'items', 'klist', 'kseq', 'krest', 'knext',
  'kcons', 'kemptyOf', 'kreverse', 'kconcat', 'ktake', 'kdrop', 'kmap2', 'kmap3', 'kmapv', 'kfilter', 'kfilterv', 'kremove', 'ksome',
  'kevery', 'kinto', 'krange1', 'krange2', 'krange3', 'kapply', 'kexInfo', 'kexMessage', 'kexData', 'restOf',
];

function unsupported(construct: string, reason: string): never {
  throw new AsUnsupportedError(construct, -1, reason);
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
  private native = new Set<number>();
  private nums = new Set<string>();

  constructor(private mod: LModule) {
    for (const f of mod.functions) this.fnById.set(f.id, f);
    this.collectGlobals(mod.body);
    for (const f of mod.functions) if (new NumericCheck(f, this.globals).ok()) this.native.add(f.id);
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
        return this.coreFnValue(v.name);
      case 'field':
        return unsupported('deftype field', 'deftype/defrecord arrive in M4');
    }
  }

  private hostCall(name: string, args: LExpr[]): string {
    const spec = HOST_FNS[name];
    if (!spec) return unsupported(name, `unknown host function; available: ${Object.keys(HOST_FNS).join(', ')}`);
    if (args.length !== spec.arity) return unsupported(name, `expects ${spec.arity} argument(s), got ${args.length}`);
    return `${spec.fn}(${this.args(args).join(', ')})`;
  }

  private coreClasses: string[] = [];

  /** A core function used as a value (e.g. `(reduce + 0 xs)`): a cached Fn wrapping the inline op. */
  private coreFnValue(name: string): string {
    const key = `core:${name}`;
    const known = this.consts.get(key);
    if (known) return known;
    const cls = `Core_${mangle(name)}`;
    const methods: string[] = [];
    const dispatch: string[] = [];
    for (let n = 0; n <= MAX_DIRECT; n++) {
      const names = Array.from({ length: n }, (_, i) => `l_a${i}`);
      const argExprs: LExpr[] = names.map((_, i) => ({ type: 'var', name: `a${i}`, kind: 'local' }));
      let body: string;
      try {
        body = this.coreCall(name, argExprs);
      } catch (err) {
        if (err instanceof AsUnsupportedError) continue;
        throw err;
      }
      methods.push(`  call${n}(${names.map((x) => `${x}: Value`).join(', ')}): Value {\n    return ${body};\n  }`);
      dispatch.push(`      case ${n}: return this.call${n}(${names.map((_, i) => `args[${i}]`).join(', ')});`);
    }
    if (methods.length === 0) return unsupported(`var ${name}`, 'not defined in this module and not a supported core function');
    const foldFn = { '+': 'add', '-': 'sub', '*': 'mul', max: 'kmax', min: 'kmin' }[name];
    const variadic = ARRAY_OPS[name]
      ? [`    return ${ARRAY_OPS[name]}(args);`]
      : foldFn
        ? [`    if (args.length > ${MAX_DIRECT}) {`, '      let acc = args[0];', `      for (let i = 1; i < args.length; i++) acc = ${foldFn}(acc, args[i]);`, '      return acc;', '    }']
        : [];
    this.coreClasses.push(
      [`class ${cls} extends Fn {`, ...methods, '  invoke(args: Array<Value>): Value {', '    switch (args.length) {', ...dispatch, '    }', ...variadic, '    return arityError();', '  }', '}'].join('\n'),
    );
    return this.constant(key, `new ${cls}()`);
  }

  private coreOpFor(e: LExpr): { name: string; op: string } | null {
    if (e.type === 'var' && e.kind === 'global' && !this.globals.has(e.name)) return { name: e.name, op: e.name };
    return null;
  }

  private arityOk(op: CoreOp, n: number): boolean {
    return Array.isArray(op.arity) ? op.arity.includes(n) : op.arity === n;
  }

  private args(args: LExpr[]): string[] {
    return args.map((a) => this.expr(a));
  }

  private closure(c: LClosure): string {
    const fn = this.fnById.get(c.fnId)!;
    // Capture order is the fn's declared capture order
    const byName = new Map(c.captures.map((cap) => [cap.name, cap.source]));
    const ctorArgs = fn.captures.map((n) => this.expr(byName.get(n)!));
    return `new Fn_${fn.id}(${ctorArgs.join(', ')})`;
  }

    private numTyped(e: LExpr): boolean {
    return isNumTyped(e, this.nums, this.globals);
  }

  /** AS expression of native f64 type for any expression (unboxing when needed). */
  private fx(e: LExpr): string {
    if (!this.numTyped(e)) return `toF64(${this.expr(e)})`;
    return this.fexpr(e);
  }

  private fexpr(e: LExpr): string {
    if (e.type === 'literal') {
      const n = e.value as number;
      return Number.isNaN(n) ? 'NaN' : n === Infinity ? 'Infinity' : n === -Infinity ? '-Infinity' : Number.isInteger(n) ? `${n}.0` : String(n);
    }
    if (e.type === 'var') return `l_${mangle(e.name)}`;
    const inv = e as Extract<LExpr, { type: 'invoke' }>;
    const op = (inv.fn as LVar).name;
    const a = inv.args.map((x) => this.fx(x));
    switch (op) {
      case '+': return a.length === 0 ? '0.0' : `(${a.join(' + ')})`;
      case '*': return a.length === 0 ? '1.0' : `(${a.join(' * ')})`;
      case '-': return a.length === 1 ? `(-${a[0]})` : `(${a.join(' - ')})`;
      case '/': return `(${a[0]} / ${a[1]})`;
      case 'rem': return `(${a[0]} % ${a[1]})`;
      case 'mod': return `nmod(${a[0]}, ${a[1]})`;
      case 'inc': return `(${a[0]} + 1.0)`;
      default: return `(${a[0]} - 1.0)`;
    }
  }

  /** AS expression of native `bool` type. */
  private cond(e: LExpr): string {
    if (e.type === 'invoke') {
      const core = this.coreOpFor(e.fn);
      if (core) {
        const cmp = { '<': '<', '>': '>', '<=': '<=', '>=': '>=' }[core.op];
        if (cmp && e.args.length === 2) return `(${this.fx(e.args[0]!)} ${cmp} ${this.fx(e.args[1]!)})`;
        const pred = { 'zero?': '== 0', 'pos?': '> 0', 'neg?': '< 0' }[core.op];
        if (pred && e.args.length === 1) return `(${this.fx(e.args[0]!)} ${pred})`;
        if (core.op === '=' && e.args.length === 2 && this.numTyped(e.args[0]!) && this.numTyped(e.args[1]!)) {
          return `(${this.fexpr(e.args[0]!)} == ${this.fexpr(e.args[1]!)})`;
        }
        const op = CORE_OPS[core.op];
        if (op && op.kind === 'bool' && this.arityOk(op, e.args.length)) {
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
    const a = this.args(e.args);
    if (e.fn.type === 'var' && e.fn.kind === 'self') {
      return a.length <= MAX_DIRECT ? `this.call${a.length}(${a.join(', ')})` : `this.invoke([${a.join(', ')}])`;
    }
    if (e.fn.type === 'keyword' && (a.length === 1 || a.length === 2)) {
      const k = this.expr(e.fn);
      return a.length === 1 ? `kget(${a[0]}, ${k})` : `kget3(${a[0]}, ${k}, ${a[1]})`;
    }
    const f = this.expr(e.fn);
    return a.length <= MAX_DIRECT ? `callV${a.length}(${[f, ...a].join(', ')})` : `callVN(${f}, [${a.join(', ')}])`;
  }

  private tableCall(name: string, a: string[]): string {
    const op = CORE_OPS[name];
    if (op && this.arityOk(op, a.length)) {
      if (op.sfx) return `${op.fn}${a.length}(${a.join(', ')})`;
      if (name === 'reduce') return `${op.fn}${a.length}(${a.join(', ')})`;
      if (name === 'get-in') return `${a.length === 2 ? 'kgetIn' : 'kgetIn3'}(${a.join(', ')})`;
      const call = `${op.fn}(${a.join(', ')})`;
      return op.kind === 'bool' ? `bool_(${call})` : call;
    }
    return unsupported(`(${name} …) with ${a.length} args`, 'unknown core function or arity');
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
      case 'conj':
        if (a.length >= 1) return a.length === 1 ? a[0]! : a.slice(2).length === 0 ? `kconj(${a[0]}, ${a[1]})` : `kconjN(${a[0]}, [${a.slice(1).join(', ')}])`;
        break;
      case 'assoc':
        if (a.length === 3) return `kassoc(${a[0]}, ${a[1]}, ${a[2]})`;
        if (a.length > 3) return `kassocN(${a[0]}, [${a.slice(1).join(', ')}])`;
        break;
      case 'nth':
        if (a.length === 3) return `knth3(${a[0]}, ${a[1]}, ${a[2]}, true)`;
        return this.tableCall(name, a);
      case 'get':
        if (a.length === 3) return `kget3(${a[0]}, ${a[1]}, ${a[2]})`;
        return this.tableCall(name, a);
      case 'apply':
        if (a.length >= 2) return `kapply(${a[0]}, [${a.slice(1, -1).join(', ')}], ${a[a.length - 1]})`;
        break;
      case 'update':
        if (a.length >= 3) return `kupdate(${a[0]}, ${a[1]}, ${a[2]}, [${a.slice(3).join(', ')}])`;
        break;
      case 'max':
      case 'min':
        if (a.length >= 1) return a.reduce((acc, x) => `k${name}(${acc}, ${x})`);
        break;
      default: {
        const arr = ARRAY_OPS[name];
        if (arr) return `${arr}([${a.join(', ')}])`;
        return this.tableCall(name, a);
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
        return e.kind === 'local' && this.nums.has(e.name) ? `mkNum(l_${mangle(e.name)})` : this.varRef(e);
      case 'invoke':
        return isArithCall(e, this.globals) ? `mkNum(${this.fexpr(e)})` : this.invoke(e);
      case 'closure':
        return this.closure(e);
      case 'host-call':
        return this.hostCall(e.name, e.args);
      case 'vector':
        return e.items.length === 0 ? 'EMPTY_VEC' : `mkVec([${this.args(e.items).join(', ')}])`;
      case 'map':
        return e.keys.length === 0 ? 'EMPTY_MAP' : `mkMap([${e.keys.flatMap((k, i) => [this.expr(k), this.expr(e.vals[i]!)]).join(', ')}])`;
      case 'set':
        return `mkSet([${this.args(e.items).join(', ')}])`;
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
        if (this.nums.has(s.name)) return [`${ind}let l_${mangle(s.name)}: f64 = ${s.init ? this.fexpr(s.init) : '0.0'};`];
        return [`${ind}let l_${mangle(s.name)}: Value = ${s.init ? this.expr(s.init) : 'NIL'};`];
      case 'assign':
        if (this.nums.has(s.name)) return [`${ind}l_${mangle(s.name)} = ${this.fexpr(s.value)};`];
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
            lines.push(`${ind}changetype<Fn_${fn.id}>(l_${mangle(b.name)}).c_${mangle(cap.name)} = ${this.expr(cap.source)};`);
          }
        }
        return lines;
      }
      case 'try':
        return unsupported('try', 'WebAssembly/AssemblyScript has no catchable exceptions; use ex-info (aborts) and return values for errors');
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
    let restDispatch = '';
    for (const ar of fn.arities) {
      const n = ar.params.length;
      const rest = ar.restParam !== null;
      const allParams = rest ? [...ar.params, ar.restParam!] : ar.params;
      const params = allParams.map((p) => `l_${mangle(p)}: Value`).join(', ');
      const method = rest ? `rest${n}` : n <= MAX_DIRECT ? `call${n}` : `ar${n}`;
      const body: string[] = [];
      if (!rest && this.native.has(fn.id)) {
        const guard = ar.params.map((p) => `l_${mangle(p)} instanceof Num`).join(' && ');
        const argv = ar.params.map((p) => `changetype<Num>(l_${mangle(p)}).v`).join(', ');
        body.push(`    if (${guard}) return mkNum(${nativeName(fn)}(${argv}));`);
      }
      this.nums = inferNumericLocals(ar.body, allParams, this.globals);
      body.push(...this.stmts(ar.body, '    '));
      const last = ar.body[ar.body.length - 1];
      if (!last || (last.type !== 'return' && last.type !== 'loop')) body.push('    return NIL;');
      else if (last.type === 'loop') body.push('    return NIL;');
      lines.push(`  ${method}(${params}): Value {`, ...body, '  }');
      if (rest) {
        restDispatch = `    if (args.length >= ${n}) return this.${method}(${[...ar.params.map((_, i) => `args[${i}]`), `restOf(args, ${n})`].join(', ')});`;
      } else {
        dispatch.push(`      case ${n}: return this.${method}(${ar.params.map((_, i) => `args[${i}]`).join(', ')});`);
      }
    }
    lines.push('  invoke(args: Array<Value>): Value {', '    switch (args.length) {', ...dispatch, '    }', ...(restDispatch ? [restDispatch] : []), '    return arityError();', '  }', '}');
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
      const a = argNames.map((n) => `mkNum(${n})`);
      return a.length <= MAX_DIRECT ? `asFn(g_${mangle(name)}).call${a.length}(${a.join(', ')})` : `asFn(g_${mangle(name)}).invoke([${a.join(', ')}])`;
    };
    const names = ar.params.map((_, i) => `a${i}`);
    if (this.native.has(fn.id) && ar === fn.arities[0]) {
      return [`export function ${wasm}(${names.map((n) => `${n}: f64`).join(', ')}): f64 {`, `  return ${nativeName(fn)}(${names.join(', ')});`, '}'];
    }
    if (name === '-main' && ar.params.length === 0) {
      return [`export function ${wasm}(): void {`, `  ${call([])};`, '}'];
    }
    return [`export function ${wasm}(${names.map((n) => `${n}: f64`).join(', ')}): f64 {`, `  return toF64(${call(names)});`, '}'];
  }

  emit(exports: string[]): string {
    const natives = this.mod.functions.filter((f) => this.native.has(f.id)).flatMap((f) => [...emitNative(f), '']);
    const fnClasses = this.mod.functions.flatMap((f) => [...this.fnClass(f), '']);
    this.nums = inferNumericLocals(this.mod.body, [], this.globals);
    const init = this.stmts(this.mod.body, '  ');
    const wrappers = exports.flatMap((n) => [...this.exportWrapper(n), '']);
    const header = [
      `import { ${RUNTIME_IMPORTS.join(', ')} } from "${RUNTIME_MODULE}";`,
      '',
    ];
    const globalDecls = [...this.globals].map((g) => `let g_${mangle(g)}: Value = NIL;`);
    return [
      ...header,
      ...this.constDecls,
      ...globalDecls,
      '',
      'function nmod(a: f64, b: f64): f64 {\n  return ((a % b) + b) % b;\n}',
      '',
      ...natives,
      ...this.coreClasses.flatMap((c) => [c, '']),
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
