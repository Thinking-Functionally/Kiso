// Lowered IR → AssemblyScript source (M2 subset).
//
// Every Kiso value is a `Value` (as-runtime/kiso-runtime.ts). Each LFunction becomes a
// class extending `Fn`; captures are constructor fields. Arities with <= 3 params
// override `callN`; `invoke(args)` dispatches on length.

import type { LExpr, LFunction, LModule, LStmt, LVar, LClosure, LProtocolImpl } from './lowered.js';
import { AsUnsupportedError } from './supported.js';
import { mangle } from './mangle.js';
import { inferNumericLocals, isArithCall, isNumTyped } from './numeric-locals.js';
import { NumericCheck, emitNative, nativeName } from './numeric.js';

const MAX_DIRECT = 3;

export const RUNTIME_MODULE = './kiso-runtime';

export type EmitOptions = {
  /** Clojure def names to export through the numeric (f64) ABI; `-main` becomes `main(): void`. */
  exports?: string[];
  /** Serverless entry: def name of a `(fn [request-map] response-map)`, exported as `kiso_handle(json): json`. */
  worker?: string;
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
  '==': { kind: 'bool', fn: 'eq', arity: 2 },
  'zero?': { kind: 'bool', fn: 'isZero', arity: 1 },
  'pos?': { kind: 'bool', fn: 'isPos', arity: 1 },
  'neg?': { kind: 'bool', fn: 'isNeg', arity: 1 },
  'even?': { kind: 'bool', fn: 'isEven', arity: 1 },
  'odd?': { kind: 'bool', fn: 'isOdd', arity: 1 },
  'nil?': { kind: 'bool', fn: 'isNil', arity: 1 },
  'some?': { kind: 'bool', fn: 'isSome', arity: 1 },
  'number?': { kind: 'bool', fn: 'isNumber', arity: 1 },
  'boolean?': { kind: 'bool', fn: 'isBoolean', arity: 1 },
  'string?': { kind: 'bool', fn: 'isString', arity: 1 },
  'keyword?': { kind: 'bool', fn: 'isKeyword', arity: 1 },
  'vector?': { kind: 'bool', fn: 'isVector', arity: 1 },
  'map?': { kind: 'bool', fn: 'isMap', arity: 1 },
  'contains?': { kind: 'bool', fn: 'kcontains', arity: 2 },
  'empty?': { kind: 'bool', fn: 'kempty', arity: 1 },
  count: { kind: 'value', fn: 'kcount', arity: 1 },
  nth: { kind: 'value', fn: 'knth', arity: 2 },
  get: { kind: 'value', fn: 'kget', arity: 2 },
  transient: { kind: 'value', fn: 'ktransient', arity: 1 },
  'persistent!': { kind: 'value', fn: 'kpersistent', arity: 1 },
  'conj!': { kind: 'value', fn: 'kconjBang', arity: 2 },
  'assoc!': { kind: 'value', fn: 'kassocBang', arity: 3 },
  'dissoc!': { kind: 'value', fn: 'kdissocBang', arity: 2 },
  'disj!': { kind: 'value', fn: 'kdisjBang', arity: 2 },
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
  reduced: { kind: 'value', fn: 'kreduced', arity: 1 },
  'reduced?': { kind: 'bool', fn: 'isReduced', arity: 1 },
  unreduced: { kind: 'value', fn: 'kunreduced', arity: 1 },
  'ensure-reduced': { kind: 'value', fn: 'kensureReduced', arity: 1 },
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
  range: { kind: 'value', fn: 'krange', arity: [0, 1, 2, 3], sfx: true },
  'lazy-seq*': { kind: 'value', fn: 'lazySeq', arity: 1 },
  doall: { kind: 'value', fn: 'kdoall', arity: 1 },
  dorun: { kind: 'value', fn: 'kdorun', arity: 1 },
  iterate: { kind: 'value', fn: 'kiterate', arity: 2 },
  repeat: { kind: 'value', fn: 'krepeat', arity: [1, 2], sfx: true },
  cycle: { kind: 'value', fn: 'kcycle', arity: 1 },
  'take-while': { kind: 'value', fn: 'ktakeWhile', arity: 2 },
  'drop-while': { kind: 'value', fn: 'kdropWhile', arity: 2 },
  mapcat: { kind: 'value', fn: 'kmapcat', arity: 2 },
  sort: { kind: 'value', fn: 'ksort', arity: [1, 2], sfx: true },
  'sort-by': { kind: 'value', fn: 'ksortBy', arity: [2, 3], sfx: true },
  compare: { kind: 'value', fn: 'kcompare', arity: 2 },
  'atom': { kind: 'value', fn: 'katom', arity: 1 },
  chan: { kind: 'value', fn: 'kchan', arity: [0, 1], sfx: true },
  buffer: { kind: 'value', fn: 'kbuffer', arity: 1 },
  'dropping-buffer': { kind: 'value', fn: 'kdroppingBuffer', arity: 1 },
  'sliding-buffer': { kind: 'value', fn: 'kslidingBuffer', arity: 1 },
  'take!': { kind: 'value', fn: 'kchTake', arity: [1, 2], sfx: true },
  'put!': { kind: 'value', fn: 'kchPut', arity: [2, 3], sfx: true },
  'close!': { kind: 'value', fn: 'kchClose', arity: 1 },
  'offer!': { kind: 'value', fn: 'kchOffer', arity: 2 },
  timeout: { kind: 'value', fn: 'ktimeout', arity: 1 },
  'go-start': { kind: 'value', fn: 'kgoStart', arity: 1 },
  'go-dispatch': { kind: 'value', fn: 'kgoDispatch', arity: 1 },
  'go-alts': { kind: 'value', fn: 'kgoAlts', arity: 2 },
  'deref': { kind: 'value', fn: 'kderef', arity: 1 },
  'reset!': { kind: 'value', fn: 'kreset', arity: 2 },
  'int': { kind: 'value', fn: 'kint', arity: 1 },
  'long': { kind: 'value', fn: 'kint', arity: 1 },
  'short': { kind: 'value', fn: 'kint', arity: 1 },
  'char': { kind: 'value', fn: 'kchar', arity: 1 },
  'char?': { kind: 'bool', fn: 'isChar', arity: 1 },
  'quot': { kind: 'value', fn: 'kquot', arity: 2 },
  'bit-shift-left': { kind: 'value', fn: 'kbitShl', arity: 2 },
  'bit-shift-right': { kind: 'value', fn: 'kbitShr', arity: 2 },
  'bit-and': { kind: 'value', fn: 'kbitAnd', arity: 2 },
  'bit-or': { kind: 'value', fn: 'kbitOr', arity: 2 },
  'bit-xor': { kind: 'value', fn: 'kbitXor', arity: 2 },
  'abs': { kind: 'value', fn: 'kabs', arity: 1 },
  'boolean': { kind: 'bool', fn: 'kboolean', arity: 1 },
  'integer?': { kind: 'bool', fn: 'isInteger', arity: 1 },
  'float?': { kind: 'bool', fn: 'isFloat', arity: 1 },
  'sorted-map?': { kind: 'bool', fn: 'isSortedMap', arity: 1 },
  'sorted-set?': { kind: 'bool', fn: 'isSortedSet', arity: 1 },
  'sorted?': { kind: 'bool', fn: 'isSorted', arity: 1 },
  'identical?': { kind: 'bool', fn: 'kidentical', arity: 2 },
  'realized?': { kind: 'bool', fn: 'krealized', arity: 1 },
  'hash': { kind: 'value', fn: 'khash', arity: 1 },
  'meta': { kind: 'value', fn: 'kmeta', arity: 1 },
  'with-meta': { kind: 'value', fn: 'kwithMeta', arity: 2 },
  'reset-meta!': { kind: 'value', fn: 'kresetMeta', arity: 2 },
  'sorted-map-empty-by': { kind: 'value', fn: 'ksortedMapEmptyBy', arity: 1 },
  'sorted-set-empty-by': { kind: 'value', fn: 'ksortedSetEmptyBy', arity: 1 },
  'subseq': { kind: 'value', fn: 'ksubseq', arity: [3, 5], sfx: true },
  'rsubseq': { kind: 'value', fn: 'krsubseq', arity: [3, 5], sfx: true },
  'fn?': { kind: 'bool', fn: 'isFn', arity: 1 },
  'sequential?': { kind: 'bool', fn: 'isSequential', arity: 1 },
  'true?': { kind: 'bool', fn: 'isTrue', arity: 1 },
  'false?': { kind: 'bool', fn: 'isFalse', arity: 1 },
  'name': { kind: 'value', fn: 'kname', arity: 1 },
  keyword: { kind: 'value', fn: 'kkeyword', arity: 1 },
  'capture-out': { kind: 'value', fn: 'kcaptureOut', arity: 1 },
  'namespace': { kind: 'value', fn: 'knamespace', arity: 1 },
  'cljstr-upper-case': { kind: 'value', fn: 'cljstrUpperCase', arity: 1 },
  'cljstr-lower-case': { kind: 'value', fn: 'cljstrLowerCase', arity: 1 },
  aget: { kind: 'value', fn: 'kaget', arity: 2 },
  aset: { kind: 'value', fn: 'kaset', arity: 3 },
  alength: { kind: 'value', fn: 'kalength', arity: 1 },
  aclone: { kind: 'value', fn: 'kaclone', arity: 1 },
  'into-array': { kind: 'value', fn: 'kintoArray', arity: 1 },
  'to-array': { kind: 'value', fn: 'kintoArray', arity: 1 },
  defmultiFn: { kind: 'value', fn: 'kdefmulti', arity: 1 },
  'read-string': { kind: 'value', fn: 'readStringV', arity: 1 },
  'cljedn-read-string': { kind: 'value', fn: 'readStringV', arity: 1 },
  'cljstr-trim': { kind: 'value', fn: 'cljstrTrim', arity: 1 },
  'cljstr-blank?': { kind: 'bool', fn: 'cljstrBlank', arity: 1 },
  'cljstr-starts-with?': { kind: 'bool', fn: 'cljstrStartsWith', arity: 2 },
  'cljstr-ends-with?': { kind: 'bool', fn: 'cljstrEndsWith', arity: 2 },
  'cljstr-includes?': { kind: 'bool', fn: 'cljstrIncludes', arity: 2 },
  'cljstr-reverse': { kind: 'value', fn: 'cljstrReverse', arity: 1 },
  'cljstr-replace': { kind: 'value', fn: 'cljstrReplace', arity: 3 },
  'cljstr-split': { kind: 'value', fn: 'cljstrSplit', arity: [2, 3], sfx: true },
  'cljstr-replace-first': { kind: 'value', fn: 'cljstrReplaceFirst', arity: 3 },
  're-find': { kind: 'value', fn: 'kreFind', arity: 2 },
  're-matches': { kind: 'value', fn: 'kreMatches', arity: 2 },
  're-seq': { kind: 'value', fn: 'kreSeq', arity: 2 },
  're-pattern': { kind: 'value', fn: 'krePattern', arity: 1 },
  'satisfies?': { kind: 'bool', fn: 'satisfiesTest', arity: 2 },
  'instance?': { kind: 'bool', fn: 'instanceTest', arity: 2 },
  'regexp?': { kind: 'bool', fn: 'isRegex', arity: 1 },
  subs: { kind: 'value', fn: 'ksubs', arity: [2, 3], sfx: true },
  'cljstr-capitalize': { kind: 'value', fn: 'cljstrCapitalize', arity: 1 },
  'cljstr-index-of': { kind: 'value', fn: 'cljstrIndexOf', arity: [2, 3], sfx: true },
  'cljstr-last-index-of': { kind: 'value', fn: 'cljstrLastIndexOf', arity: [2, 3], sfx: true },
  'cljstr-triml': { kind: 'value', fn: 'cljstrTriml', arity: 1 },
  'cljstr-trimr': { kind: 'value', fn: 'cljstrTrimr', arity: 1 },
  'cljstr-trim-newline': { kind: 'value', fn: 'cljstrTrimNewline', arity: 1 },
  'cljstr-split-lines': { kind: 'value', fn: 'cljstrSplitLines', arity: 1 },
  'cljstr-escape': { kind: 'value', fn: 'cljstrEscape', arity: 2 },
  'cljstr-join': { kind: 'value', fn: 'cljstrJoin', arity: [1, 2], sfx: true },
  'Math/abs': { kind: 'value', fn: 'kabs', arity: 1 },
  'Math/sqrt': { kind: 'value', fn: 'ksqrt', arity: 1 },
  'Math/pow': { kind: 'value', fn: 'kpow', arity: 2 },
  'Math/floor': { kind: 'value', fn: 'kfloor', arity: 1 },
  'Math/ceil': { kind: 'value', fn: 'kceil', arity: 1 },
  symbol: { kind: 'value', fn: 'ksymbol', arity: [1, 2], sfx: true },
  'symbol?': { kind: 'bool', fn: 'isSymbol', arity: 1 },
  key: { kind: 'value', fn: 'kfirst', arity: 1 },
  val: { kind: 'value', fn: 'ksecond', arity: 1 },
  'ex-info': { kind: 'value', fn: 'kexInfo', arity: 2 },
  'ex-message': { kind: 'value', fn: 'kexMessage', arity: 1 },
  'ex-data': { kind: 'value', fn: 'kexData', arity: 1 },
};
// Runtime fns taking all arguments as one Array<Value>.
// Transducer-returning arities are implemented by prelude functions in Kiso.
const TRANSDUCER_ARITY: Record<string, { argc: number; fn: string }> = {
  map: { argc: 1, fn: 'map-xf' },
  filter: { argc: 1, fn: 'filter-xf' },
  take: { argc: 1, fn: 'take-xf' },
  into: { argc: 3, fn: 'into-xf' },
};
const CMP_OPS: Record<string, number> = { '<': 0, '>': 1, '<=': 2, '>=': 3 };
const ARRAY_OPS: Record<string, string> = { vector: 'vector', 'hash-map': 'hashMap', 'pr-str': 'prStr', prn: 'prn', println: 'println', print: 'print', pr: 'pr', str: 'str', list: 'klist', 'hash-set': 'hashSet', concat: 'kconcat', 'sorted-map': 'sortedMap', 'sorted-set': 'sortedSet', array: 'karray' };

const HOST_FNS: Record<string, { fn: string; arity: number }> = {
  'host/args': { fn: 'hostArgs', arity: 0 },
  'host/env': { fn: 'hostEnvGet', arity: 1 },
  'host/read-file': { fn: 'hostReadFileV', arity: 1 },
  'host/write-file': { fn: 'hostWriteFileV', arity: 2 },
  'host/stdin': { fn: 'hostStdinV', arity: 0 },
  'host/exit': { fn: 'hostExitV', arity: 1 },
  'host/now': { fn: 'hostNowV', arity: 0 },
  'multi/add-method': { fn: 'kmultiAddMethod', arity: 3 },
  'host/json-parse': { fn: 'jsonParseV', arity: 1 },
  'host/json-stringify': { fn: 'jsonStringifyV', arity: 1 },
};

const ASYNC_OPS = new Set(['chan', 'take!', 'put!', 'close!', 'offer!', 'timeout', 'go-start', 'go-dispatch', 'go-alts']);

const RUNTIME_IMPORTS = [
  'kdrain', 'kchan0', 'kchan1', 'kbuffer', 'kdroppingBuffer', 'kslidingBuffer', 'kchTake1', 'kchTake2', 'kchPut2', 'kchPut3', 'kchClose', 'kchOffer', 'ktimeout', 'kgoStart', 'kgoDispatch', 'kgoAlts',
  'hostArgs', 'hostEnvGet', 'hostReadFileV', 'hostWriteFileV', 'hostStdinV', 'hostExitV', 'hostNowV',
  'Value', 'Fn', 'Num', 'Str', 'Kw', 'NIL', 'TRUE', 'FALSE', 'bool_', 'truthy', 'asFn', 'arityError', 'throwValue', 'toF64', 'mkNum',
  'add', 'sub', 'mul', 'div', 'neg', 'inc', 'dec', 'rem', 'mod', 'lt', 'gt', 'lte', 'gte', 'isZero', 'isPos', 'isNeg', 'eq',
  'isEven', 'isOdd', 'isNil', 'isSome', 'isNumber', 'isString', 'isBoolean', 'isKeyword', 'isVector', 'isMap', 'identity',
  'mkVec', 'mkMap', 'EMPTY_VEC', 'EMPTY_MAP', 'vector', 'hashMap', 'kcount', 'kempty', 'kconj', 'kconjN', 'knth', 'knth3', 'kget', 'kget3', 'kassoc', 'kassocN',
  'kdissoc', 'kcontains', 'kkeys', 'kvals', 'kfirst', 'ksecond', 'klast', 'kpeek', 'kpop', 'kvec', 'kmax', 'kmin',
  'callV0', 'callV1', 'callV2', 'callV3', 'callVN', 'kkeyword', 'ktransient', 'kpersistent', 'kconjBang', 'kassocBang', 'kdissocBang', 'kdisjBang', 'kreduce2', 'kreduce3', 'kreduced', 'isReduced', 'kunreduced', 'kensureReduced', 'kupdate', 'kgetIn', 'kgetIn3',
  'println', 'print', 'pr', 'kcaptureOut', 'prn', 'prStr', 'str',
  'SetV', 'ExInfo', 'EMPTY_SET', 'mkSet', 'hashSet', 'kset', 'kdisj', 'isSet', 'isList', 'isSeq', 'items', 'klist', 'kseq', 'krest', 'knext',
  'kcons', 'kemptyOf', 'kreverse', 'kconcat', 'ktake', 'kdrop', 'kmap2', 'kmap3', 'kmapv', 'kfilter', 'kfilterv', 'kremove', 'ksome',
  'Rec', 'Reified', 'noImpl', 'kevery', 'kinto', 'krange1', 'krange2', 'krange3', 'kapply', 'lazySeq', 'kdoall', 'kdorun', 'kiterate', 'krepeat1', 'krepeat2', 'kcycle', 'ktakeWhile', 'kdropWhile', 'kmapcat', 'krange0', 'ksort1', 'ksort2', 'ksortBy2', 'ksortBy3', 'kcompare', 'kexInfo', 'kexMessage', 'Sym', 'ksymbol1', 'ksymbol2', 'isSymbol', 'kcmpN', 'ksqrt', 'kpow', 'kfloor', 'kceil', 'katom', 'kderef', 'kreset', 'kint', 'kint', 'kquot', 'kbitShl', 'kbitShr', 'kbitAnd', 'kbitOr', 'kbitXor', 'kabs', 'kboolean', 'isInteger', 'isFloat', 'isFn', 'SortedMapV', 'sortedMap', 'sortedSet', 'kdefmulti', 'kmultiAddMethod', 'karray', 'kintoArray', 'kaget', 'kaset', 'kalength', 'kaclone', 'Arr', 'sortedMapBy', 'sortedSetBy', 'ksortedMapEmptyBy', 'ksortedSetEmptyBy', 'isSortedMap', 'isSortedSet', 'isSorted', 'ksubseq3', 'ksubseq5', 'krsubseq3', 'krsubseq5', 'kmeta', 'kwithMeta', 'kresetMeta', 'kidentical', 'khash', 'krealized', 'isSequential', 'isTrue', 'isFalse', 'kname', 'knamespace', 'cljstrUpperCase', 'cljstrLowerCase', 'cljstrTrim', 'cljstrBlank', 'cljstrStartsWith', 'cljstrEndsWith', 'cljstrIncludes', 'cljstrReverse', 'cljstrReplace', 'cljstrSplit2', 'cljstrSplit3', 'cljstrReplaceFirst', 'Re', 'kreCompile', 'kreFind', 'kreMatches', 'kreSeq', 'krePattern', 'isRegex', 'cljstrCapitalize', 'cljstrIndexOf2', 'cljstrIndexOf3', 'cljstrLastIndexOf2', 'cljstrLastIndexOf3', 'cljstrTriml', 'cljstrTrimr', 'cljstrTrimNewline', 'cljstrSplitLines', 'cljstrEscape', 'isChar', 'kchar', 'Atom', 'kswap', 'ksubs2', 'ksubs3', 'cljstrJoin1', 'cljstrJoin2',  'kexData', 'restOf',
];

function unsupported(construct: string, reason: string): never {
  throw new AsUnsupportedError(construct, -1, reason);
}

export function wasmExportName(name: string): string {
  const stripped = name.replace(/^-+/, '');
  const n = stripped.replace(/[^A-Za-z0-9_]/g, '_');
  return n.length > 0 ? n : '_';
}

type TypeInfo = { name: string; cls: string; fields: string[]; record: boolean };
type ImplTarget = { kind: 'user'; cls: string } | { kind: 'test'; test: (x: string) => string } | { kind: 'default' };
type Impl = { protocol: string; method: string; argc: number; fnId: number; target: ImplTarget };

// extend-type targets (JS-style and Clojure-style names) -> runtime class tests
const BUILTIN_TARGETS: Record<string, ImplTarget> = (() => {
  const t = (test: (x: string) => string): ImplTarget => ({ kind: 'test', test });
  const num = t((x) => `${x} instanceof Num`);
  const str = t((x) => `${x} instanceof Str`);
  const vec = t((x) => `(${x} instanceof Vec && !changetype<Vec>(${x}).list)`);
  const list = t((x) => `(${x} instanceof Vec && changetype<Vec>(${x}).list)`);
  const map = t((x) => `${x} instanceof MapV`);
  const set = t((x) => `${x} instanceof SetV`);
  const fn = t((x) => `${x} instanceof Fn`);
  return {
    Number: num, number: num, String: str, string: str, Keyword: t((x) => `${x} instanceof Kw`),
    Boolean: t((x) => `(${x} === TRUE || ${x} === FALSE)`), boolean: t((x) => `(${x} === TRUE || ${x} === FALSE)`),
    Vector: vec, PersistentVector: vec, vector: vec, List: list, PersistentList: list, list,
    Map: map, PersistentHashMap: map, PersistentArrayMap: map, map, Set: set, PersistentHashSet: set, set,
    Fn: fn, Function: fn, function: fn, default: { kind: 'default' }, Object: { kind: 'default' },
  };
})();

class Emitter {
  private types = new Map<string, TypeInfo>();
  private impls: Impl[] = [];
  private protocols = new Map<string, string[]>();
  private protoFns = new Map<string, { protocol: string; method: string }>();
  private hoisted = new Set<LStmt>();
  private reifyArgc = new Map<string, Set<number>>();
  private methodSingletons = new Set<number>();
  private consts = new Map<string, string>();
  private constDecls: string[] = [];
  private globals = new Set<string>();
  private fnById = new Map<number, LFunction>();
  private native = new Set<number>();
  private nums = new Set<string>();

  constructor(private mod: LModule) {
    for (const f of mod.functions) this.fnById.set(f.id, f);
    this.collectGlobals(mod.body);
    this.collectTypes(mod.body);
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

  private isGlobalCall(e: LExpr | null | undefined, name: string): e is Extract<LExpr, { type: 'invoke' }> {
    return !!e && e.type === 'invoke' && e.fn.type === 'var' && e.fn.kind === 'global' && e.fn.name === name && !this.globals.has(name);
  }

  /** Protocols and types are closed-world: found up front so dispatchers can be generated statically. */
  private collectTypes(body: LStmt[]): void {
    for (const s of body) {
      if (s.type === 'def' && this.isGlobalCall(s.value, 'defprotocol')) {
        const [nameArg, methodsArg] = s.value.args;
        if (nameArg?.type !== 'literal' || methodsArg?.type !== 'vector') unsupported('defprotocol', 'unexpected shape');
        this.protocols.set(String(nameArg.value), methodsArg.items.map((m) => String((m as { value: unknown }).value)));
        this.hoisted.add(s);
      } else if (s.type === 'def' && this.isGlobalCall(s.value, 'protocolFn')) {
        const [protoArg, methodArg] = s.value.args;
        if (protoArg?.type !== 'var' || methodArg?.type !== 'literal') unsupported('protocolFn', 'unexpected shape');
        this.protoFns.set(s.name, { protocol: protoArg.name, method: String(methodArg.value) });
      } else if (s.type === 'type-def') {
        this.types.set(s.name, { name: s.name, cls: `T_${mangle(s.name)}`, fields: s.fields, record: s.kind === 'defrecord' });
        this.hoisted.add(s);
      }
    }
    for (const s of body) {
      if (s.type === 'type-def') this.registerImpls({ kind: 'user', cls: this.types.get(s.name)!.cls }, s.protocols);
      else if (s.type === 'extend-type') {
        this.registerImpls(this.extendTarget(s.target), s.protocols);
        this.hoisted.add(s);
      }
    }
  }

  private extendTarget(t: LExpr): ImplTarget {
    if (t.type === 'literal' && t.jsType === 'null') return { kind: 'test', test: (x) => `${x} === NIL` };
    if (t.type === 'var' && t.kind === 'global') {
      const user = this.types.get(t.name);
      if (user) return { kind: 'user', cls: user.cls };
      const builtin = BUILTIN_TARGETS[t.name];
      if (builtin) return builtin;
      return unsupported(`extend-type ${t.name}`, `unknown type; supported: nil, ${Object.keys(BUILTIN_TARGETS).join(', ')} or a deftype/defrecord of this module`);
    }
    return unsupported('extend-type', 'target must be nil or a type name');
  }

  private protocolName(p: LExpr): string {
    const name = p.type === 'var' ? p.name : '';
    if (!this.protocols.has(name)) unsupported(`protocol ${name || '?'}`, 'only protocols defined with defprotocol in this module are supported');
    return name;
  }

  private registerImpls(target: ImplTarget, protocols: LProtocolImpl[]): void {
    for (const p of protocols) {
      const protocol = this.protocolName(p.protocol);
      for (const m of p.methods) {
        const fn = this.fnById.get(m.fn.fnId)!;
        if (fn.captures.length > 0) unsupported(`method ${m.name}`, 'type/extend-type methods cannot capture local variables');
        this.impls.push({ protocol, method: m.name, argc: fn.arities[0]!.params.length, fnId: fn.id, target });
        if (!this.methodSingletons.has(fn.id)) {
          this.methodSingletons.add(fn.id);
          this.constDecls.push(`const MF_${fn.id}: Fn_${fn.id} = new Fn_${fn.id}();`);
        }
      }
    }
  }

  private typeClass(t: TypeInfo): string[] {
    const fs = t.fields;
    const prop = (f: string) => `f_${mangle(f)}`;
    const lines = [`class ${t.cls} extends ${t.record ? 'Rec' : 'Value'} {`];
    lines.push(fs.length > 0 ? `  constructor(${fs.map((f) => `public ${prop(f)}: Value`).join(', ')}) {` : '  constructor() {', '    super();', '  }');
    if (t.record) {
      const sw = (body: (i: number) => string, dflt: string) =>
        fs.length === 0 ? [`    return ${dflt};`] : ['    switch (i) {', ...fs.map((_, i) => `      case ${i}: return ${body(i)};`), '    }', `    return ${dflt};`];
      lines.push(
        `  typeName(): string {
    return ${JSON.stringify(t.name)};
  }`,
        `  nFields(): i32 {
    return ${fs.length};
  }`,
        '  fieldName(i: i32): string {', ...sw((i) => JSON.stringify(fs[i]), '""'), '  }',
        '  fieldAt(i: i32): Value {', ...sw((i) => `this.${prop(fs[i]!)}`, 'NIL'), '  }',
        `  withFieldAt(i: i32, v: Value): Rec {
    return new ${t.cls}(${fs.map((f, i) => `i == ${i} ? v : this.${prop(f)}`).join(', ')});
  }`,
        `  static fromMap(m: Value): Value {
    return new ${t.cls}(${fs.map((f) => `kget(m, ${this.expr({ type: 'keyword', ns: null, name: f })})`).join(', ')});
  }`,
      );
    }
    lines.push('}');
    return lines;
  }

  private ctorOf(name: string): { type: TypeInfo; map: boolean } | null {
    if (name.startsWith('map->')) {
      const t = this.types.get(name.slice(5));
      return t?.record ? { type: t, map: true } : null;
    }
    if (name.startsWith('->')) {
      const t = this.types.get(name.slice(2));
      return t ? { type: t, map: false } : null;
    }
    return null;
  }

  private protocolClass(global: string, protocol: string, method: string): string[] {
    const impls = this.impls.filter((i) => i.protocol === protocol && i.method === method);
    const argcs = [...new Set([...impls.map((i) => i.argc), ...(this.reifyArgc.get(`${protocol}/${method}`) ?? [])])].sort((a, b) => a - b);
    const callOn = (f: string, argc: number, a: string[]) => (argc <= MAX_DIRECT ? `${f}.call${argc}(${a.join(', ')})` : `${f}.invoke([${a.join(', ')}])`);
    const chain = (argc: number, a: string[]): string[] => {
      const out: string[] = [];
      const mine = impls.filter((i) => i.argc === argc);
      let dflt: Impl | undefined;
      for (const i of mine) {
        const call = `return ${callOn(`MF_${i.fnId}`, argc, a)};`;
        if (i.target.kind === 'default') dflt = i;
        else out.push(`    if (${i.target.kind === 'user' ? `${a[0]} instanceof ${i.target.cls}` : i.target.test(a[0]!)}) ${call}`);
      }
      out.push(`    if (${a[0]} instanceof Reified) {`, `      const f = changetype<Reified>(${a[0]}).find(${JSON.stringify(`${protocol}/${method}/${argc}`)});`, `      if (f !== null) return ${callOn('f', argc, a)};`, '    }');
      if (dflt) out.push(`    return ${callOn(`MF_${dflt.fnId}`, argc, a)};`);
      else out.push(`    return noImpl(${JSON.stringify(protocol)}, ${JSON.stringify(method)}, ${a[0]});`);
      return out;
    };
    const lines = [`class PF_${mangle(global)} extends Fn {`];
    const dispatch: string[] = [];
    for (const argc of argcs) {
      if (argc === 0) continue;
      const a = Array.from({ length: argc }, (_, i) => `a${i}`);
      if (argc <= MAX_DIRECT) {
        lines.push(`  call${argc}(${a.map((x) => `${x}: Value`).join(', ')}): Value {`, ...chain(argc, a), '  }');
        dispatch.push(`      case ${argc}: return this.call${argc}(${a.map((_, i) => `args[${i}]`).join(', ')});`);
      } else {
        dispatch.push(`      case ${argc}: {`, ...a.map((x, i) => `        const ${x} = args[${i}];`), ...chain(argc, a).map((l) => `    ${l}`), '      }');
      }
    }
    lines.push('  invoke(args: Array<Value>): Value {', '    switch (args.length) {', ...dispatch, '    }', '    return arityError();', '  }', '}');
    return lines;
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
      case 'regex':
        return this.constant(`r:${value as string}`, `kreCompile(${JSON.stringify(value)})`);
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
        return `s_.f_${mangle(v.name)}`;
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
        : CMP_OPS[name] !== undefined
          ? [`    if (args.length > 0) return bool_(kcmpN(${CMP_OPS[name]}, args));`]
          : [];
    this.coreClasses.push(
      [`class ${cls} extends Fn {`, ...methods, '  invoke(args: Array<Value>): Value {', '    switch (args.length) {', ...dispatch, '    }', ...variadic, '    return arityError();', '  }', '}'].join('\n'),
    );
    return this.constant(key, `new ${cls}()`);
  }

  private satUsed = new Set<string>();

  /** `satisfies?` / `instance?` are resolved at compile time against the closed world of types and protocols. */
  private typeTest(name: string, args: LExpr[]): string | null {
    const head = args[0];
    if ((name !== 'satisfies?' && name !== 'instance?') || args.length !== 2 || head?.type !== 'var' || head.kind !== 'global') return null;
    if (name === 'satisfies?') {
      if (!this.protocols.has(head.name)) return null;
      this.satUsed.add(head.name);
      return `SAT_${mangle(head.name)}(${this.expr(args[1]!)})`;
    }
    const user = this.types.get(head.name);
    if (user) return `(${this.expr(args[1]!)} instanceof ${user.cls})`;
    const builtin = BUILTIN_TARGETS[head.name];
    if (builtin && builtin.kind === 'test') return builtin.test(this.expr(args[1]!));
    return null;
  }

  private satFn(protocol: string): string[] {
    const tests: string[] = [];
    for (const i of this.impls.filter((x) => x.protocol === protocol)) {
      if (i.target.kind === 'default') return [`function SAT_${mangle(protocol)}(x: Value): bool {`, '  return x !== NIL;', '}'];
      tests.push(i.target.kind === 'user' ? `x instanceof ${i.target.cls}` : i.target.test('x'));
    }
    tests.push(`(x instanceof Reified && changetype<Reified>(x).hasProtocol(${JSON.stringify(protocol + '/')}))`);
    return [`function SAT_${mangle(protocol)}(x: Value): bool {`, `  return ${[...new Set(tests)].join(' || ')};`, '}'];
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
        const tt = this.typeTest(core.op, e.args);
        if (tt) return tt;
        if (core.op === 'satisfies?' || core.op === 'instance?') return `truthy(${this.expr(e)})`;
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
    const xf = core && TRANSDUCER_ARITY[core.op];
    if (xf && xf.argc === e.args.length && this.globals.has(xf.fn)) {
      return this.invoke({ ...e, fn: { type: 'var', name: xf.fn, kind: 'global' } });
    }
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

  private usesAsync = false;

  private tableCall(name: string, a: string[]): string {
    const op = CORE_OPS[name];
    if (op && this.arityOk(op, a.length)) {
      if (ASYNC_OPS.has(name)) this.usesAsync = true;
      if (op.sfx) return `${op.fn}${a.length}(${a.join(', ')})`;
      if (name === 'reduce') return `${op.fn}${a.length}(${a.join(', ')})`;
      if (name === 'get-in') return `${a.length === 2 ? 'kgetIn' : 'kgetIn3'}(${a.join(', ')})`;
      const call = `${op.fn}(${a.join(', ')})`;
      return op.kind === 'bool' ? `bool_(${call})` : call;
    }
    return unsupported(`(${name} …) with ${a.length} args`, 'unknown core function or arity');
  }

  private coreCall(name: string, args: LExpr[]): string {
    if (name === 'satisfies?' || name === 'instance?') {
      const tt = this.typeTest(name, args);
      if (tt) return `bool_(${tt})`;
      return unsupported(`(${name} …)`, name === 'satisfies?' ? 'first argument must be a protocol defined in this module' : 'first argument must be a deftype/defrecord of this module or a built-in type name');
    }
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
      case '<':
      case '>':
      case '<=':
      case '>=':
        if (a.length === 2) return this.tableCall(name, a);
        if (a.length >= 1) return `bool_(kcmpN(${CMP_OPS[name]}, [${a.join(', ')}]))`;
        break;
      case 'swap!':
        if (a.length >= 2) return `kswap(${a[0]}, ${a[1]}, [${a.slice(2).join(', ')}])`;
        break;
      case 'update':
        if (a.length >= 3) return `kupdate(${a[0]}, ${a[1]}, ${a[2]}, [${a.slice(3).join(', ')}])`;
        break;
      case 'max':
      case 'min':
        if (a.length >= 1) return a.reduce((acc, x) => `k${name}(${acc}, ${x})`);
        break;
      default: {
        const ctor = this.ctorOf(name);
        if (ctor) {
          const want = ctor.map ? 1 : ctor.type.fields.length;
          if (a.length !== want) return unsupported(`(${name} …)`, `expects ${want} argument(s), got ${a.length}`);
          return ctor.map ? `${ctor.type.cls}.fromMap(${a[0]})` : `new ${ctor.type.cls}(${a.join(', ')})`;
        }
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
      case 'new': {
        const t = e.ctor.type === 'var' && e.ctor.kind === 'global' ? this.types.get(e.ctor.name) : undefined;
        if (!t && e.ctor.type === 'var' && e.ctor.name === 'LazySeq' && e.args.length === 1) return `lazySeq(${this.expr(e.args[0]!)})`;
        if (!t) return unsupported('new', 'only deftype/defrecord types of this module can be constructed');
        if (e.args.length !== t.fields.length) return unsupported(`(${t.name}. …)`, `expects ${t.fields.length} argument(s), got ${e.args.length}`);
        return `new ${t.cls}(${this.args(e.args).join(', ')})`;
      }
      case 'reify': {
        const keys: string[] = [];
        const fns: string[] = [];
        for (const p of e.protocols) {
          const protocol = this.protocolName(p.protocol);
          for (const m of p.methods) {
            const argc = this.fnById.get(m.fn.fnId)!.arities[0]!.params.length;
            const k = `${protocol}/${m.name}`;
            if (!this.reifyArgc.has(k)) this.reifyArgc.set(k, new Set());
            this.reifyArgc.get(k)!.add(argc);
            keys.push(JSON.stringify(`${k}/${argc}`));
            fns.push(this.closure(m.fn));
          }
        }
        return `new Reified([${keys.join(', ')}], [${fns.join(', ')}])`;
      }
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
        if (s.type === 'def' && this.hoisted.has(s)) return [];
        const pf = s.type === 'def' ? this.protoFns.get(s.name) : undefined;
        if (pf) return [`${ind}g_${mangle(s.name)} = new PF_${mangle(s.name)}();`];
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
        return this.hoisted.has(s) ? [] : unsupported(s.kind, 'must be defined at the top level of the module');
      case 'extend-type':
        return this.hoisted.has(s) ? [] : unsupported('extend-type', 'must be used at the top level of the module');
      case 'ns':
        if (s.requires.length > 0) unsupported('ns :require', 'module imports arrive in M5');
        return [];
    }
  }

  // -- functions -------------------------------------------------------------

  private fnClass(fn: LFunction): string[] {
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
      if (fn.owner) {
        const t = this.types.get(fn.owner);
        if (!t || ar.params.length === 0) unsupported(`method of ${fn.owner}`, 'type methods need a `this` parameter');
        body.push(`    const s_ = changetype<${t.cls}>(l_${mangle(ar.params[0]!)});`);
      }
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
      return [`export function ${wasm}(): void {`, `  ${call([])};`, ...(this.usesAsync ? ['  kdrain();'] : []), '}'];
    }
    return [`export function ${wasm}(${names.map((n) => `${n}: f64`).join(', ')}): f64 {`, `  return toF64(${call(names)});`, '}'];
  }

  private workerEntry(handler: string): string[] {
    if (!this.globals.has(handler)) unsupported(`worker handler ${handler}`, 'not defined in this module');
    return ['export function kiso_handle(req: string): string {', `  return jsonStringify(callV1(g_${mangle(handler)}, jsonParse(req)));`, '}', ''];
  }

  emit(exports: string[], worker?: string): string {
    const natives = this.mod.functions.filter((f) => this.native.has(f.id)).flatMap((f) => [...emitNative(f), '']);
    const fnClasses = this.mod.functions.flatMap((f) => [...this.fnClass(f), '']);
    this.nums = inferNumericLocals(this.mod.body, [], this.globals);
    const init = this.stmts(this.mod.body, '  ');
    const typeClasses = [...this.types.values()].flatMap((t) => [...this.typeClass(t), '']);
    const protoClasses = [...this.protoFns].flatMap(([g, p]) => [...this.protocolClass(g, p.protocol, p.method), '']);
    const satFns = [...this.satUsed].flatMap((p) => [...this.satFn(p), '']);
    const wrappers = [...exports.flatMap((n) => [...this.exportWrapper(n), '']), ...(worker ? this.workerEntry(worker) : [])];
    const header = [
      `import { ${RUNTIME_IMPORTS.join(', ')} } from "${RUNTIME_MODULE}";`,
      'import { jsonParse, jsonStringify, jsonParseV, jsonStringifyV, readStringV } from "./kiso-json";',
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
      ...typeClasses,
      ...protoClasses,
      ...satFns,
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
  return new Emitter(mod).emit(opts.exports ?? [], opts.worker);
}
