// Kiso AssemblyScript runtime (M2). Compiled together with generated code by asc;
// NOT part of the TypeScript build (lives outside src/).
//
// Value model (D18): every Kiso value is a `Value` heap object. Singletons for
// nil/true/false so truthiness and identity checks are pointer comparisons.

export abstract class Value {}

export class Nil extends Value {}
export class Bool extends Value {
  constructor(public v: bool) {
    super();
  }
}
export class Num extends Value {
  constructor(public v: f64) {
    super();
  }
}
export class Str extends Value {
  h: i32 = 0;
  constructor(public v: string) {
    super();
  }
}
export class Kw extends Value {
  h: i32 = 0;
  constructor(
    public ns: string,
    public name: string,
  ) {
    super();
  }
}

export class Sym extends Value {
  h: i32 = 0;
  constructor(
    public ns: string,
    public name: string,
  ) {
    super();
  }
}

export const NIL: Value = new Nil();
export const TRUE: Value = new Bool(true);
export const FALSE: Value = new Bool(false);

export function bool_(b: bool): Value {
  return b ? TRUE : FALSE;
}

export function truthy(v: Value): bool {
  return v !== NIL && v !== FALSE;
}

// -- Host interface (D17) ----------------------------------------------------

@external("kiso", "write")
declare function hostWrite(s: string): void;
@external("host", "argc")
declare function hostArgc(): i32;
@external("host", "arg")
declare function hostArg(i: i32): string;
@external("host", "env")
declare function hostEnv(name: string): string | null;
@external("host", "read_file")
declare function hostReadFile(path: string): string | null;
@external("host", "write_file")
declare function hostWriteFile(path: string, content: string): bool;
@external("host", "stdin")
declare function hostStdin(): string;
@external("host", "exit")
declare function hostExit(code: i32): void;
@external("host", "now")
declare function hostNow(): f64;

// -- Functions ---------------------------------------------------------------

export abstract class Fn extends Value {
  invoke(args: Array<Value>): Value {
    return arityError();
  }
  call0(): Value {
    return this.invoke([]);
  }
  call1(a: Value): Value {
    return this.invoke([a]);
  }
  call2(a: Value, b: Value): Value {
    return this.invoke([a, b]);
  }
  call3(a: Value, b: Value, c: Value): Value {
    return this.invoke([a, b, c]);
  }
}

export function arityError(): Value {
  abort("Wrong number of args passed to fn");
  return NIL;
}

export function asFn(v: Value): Fn {
  if (v instanceof Fn) return changetype<Fn>(v);
  abort("Value is not callable");
  return unreachable();
}

export function throwValue(v: Value): void {
  if (v instanceof ExInfo) abort(changetype<ExInfo>(v).msg);
  else abort(toStr(v, false));
}

// -- Numbers -----------------------------------------------------------------

// Small integers are cached so hot loops do not allocate (D20).
const SMALL_MIN: i32 = -128;
const SMALL_MAX: i32 = 1024;
function makeSmall(): Array<Num> {
  const a = new Array<Num>(SMALL_MAX - SMALL_MIN);
  for (let i = 0; i < a.length; i++) a[i] = new Num(<f64>(i + SMALL_MIN));
  return a;
}
const SMALL: Array<Num> = makeSmall();

@inline
export function mkNum(x: f64): Value {
  const i = <i32>x;
  if (<f64>i == x && i >= SMALL_MIN && i < SMALL_MAX && (i != 0 || reinterpret<i64>(x) == 0)) {
    return unchecked(SMALL[i - SMALL_MIN]);
  }
  return new Num(x);
}

export function toF64(v: Value): f64 {
  if (v instanceof Num) return changetype<Num>(v).v;
  abort("Value is not a number");
  return 0;
}

export function add(a: Value, b: Value): Value {
  return mkNum(toF64(a) + toF64(b));
}
export function sub(a: Value, b: Value): Value {
  return mkNum(toF64(a) - toF64(b));
}
export function mul(a: Value, b: Value): Value {
  return mkNum(toF64(a) * toF64(b));
}
export function div(a: Value, b: Value): Value {
  return mkNum(toF64(a) / toF64(b));
}
export function neg(a: Value): Value {
  return mkNum(-toF64(a));
}
export function inc(a: Value): Value {
  return mkNum(toF64(a) + 1);
}
export function dec(a: Value): Value {
  return mkNum(toF64(a) - 1);
}
export function rem(a: Value, b: Value): Value {
  return mkNum(toF64(a) % toF64(b));
}
export function mod(a: Value, b: Value): Value {
  const y = toF64(b);
  return mkNum(((toF64(a) % y) + y) % y);
}

export function lt(a: Value, b: Value): bool {
  return toF64(a) < toF64(b);
}
export function gt(a: Value, b: Value): bool {
  return toF64(a) > toF64(b);
}
export function lte(a: Value, b: Value): bool {
  return toF64(a) <= toF64(b);
}
export function gte(a: Value, b: Value): bool {
  return toF64(a) >= toF64(b);
}
export function isZero(a: Value): bool {
  return toF64(a) == 0;
}
export function isPos(a: Value): bool {
  return toF64(a) > 0;
}
export function isNeg(a: Value): bool {
  return toF64(a) < 0;
}

// -- Collections (D20) --------------------------------------------------------
//
// Vec: persistent by sharing an append-only backing array; a Vec only sees its first `n`
// slots, so `conj` is amortized O(1) and older versions are unaffected.
// MapV: insertion-ordered array map with a lazily built open-addressing index (n > 8).

export class Vec extends Value {
  constructor(
    public a: Array<Value>,
    public n: i32,
    public list: bool,
  ) {
    super();
  }
}

const INDEX_MIN: i32 = 8;

export class MapV extends Value {
  constructor(
    public keys: Array<Value>,
    public vals: Array<Value>,
    public n: i32,
    public idx: Int32Array | null,
  ) {
    super();
  }
}

export const EMPTY_VEC: Value = new Vec([], 0, false);
export const EMPTY_MAP: Value = new MapV([], [], 0, null);

function hashStr(s: string): i32 {
  let h: i32 = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h;
}

export function hashOf(v: Value): i32 {
  if (v === NIL) return 0;
  if (v instanceof Rec) {
    const r = changetype<Rec>(v);
    let h: i32 = 17;
    for (let i = 0; i < r.nFields(); i++) h = h * 31 + hashOf(r.fieldAt(i));
    return h;
  }
  if (v === TRUE) return 1231;
  if (v === FALSE) return 1237;
  if (v instanceof Num) {
    let f = changetype<Num>(v).v;
    if (f == 0) f = 0;
    const b = reinterpret<i64>(f);
    return <i32>(b ^ (b >>> 32));
  }
  if (v instanceof Str) {
    const s = changetype<Str>(v);
    if (s.h == 0) s.h = hashStr(s.v) | 1;
    return s.h;
  }
  if (v instanceof Sym) {
    const k = changetype<Sym>(v);
    if (k.h == 0) k.h = (hashStr(k.ns) * 37 + hashStr(k.name)) | 1;
    return k.h;
  }
  if (v instanceof Kw) {
    const k = changetype<Kw>(v);
    if (k.h == 0) k.h = (hashStr(k.ns) * 31 + hashStr(k.name)) | 1;
    return k.h;
  }
  if (v instanceof Vec) {
    const x = changetype<Vec>(v);
    let h: i32 = 1;
    for (let i = 0; i < x.n; i++) h = h * 31 + hashOf(unchecked(x.a[i]));
    return h;
  }
  if (v instanceof LazySeq) {
    const a = lazyItems(v);
    let h: i32 = 1;
    for (let i = 0; i < a.length; i++) h = h * 31 + hashOf(a[i]);
    return h;
  }
  if (v instanceof MapV) {
    const m = changetype<MapV>(v);
    let h: i32 = 0;
    for (let i = 0; i < m.n; i++) h += hashOf(unchecked(m.keys[i])) ^ hashOf(unchecked(m.vals[i]));
    return h;
  }
  if (v instanceof SetV) {
    const m = changetype<SetV>(v).m;
    let h: i32 = 7;
    for (let i = 0; i < m.n; i++) h += hashOf(unchecked(m.keys[i]));
    return h;
  }
  return <i32>changetype<usize>(v);
}

export function eq(a: Value, b: Value): bool {
  if (a === b) return true;
  if (a instanceof Rec) {
    if (!(b instanceof Rec)) return false;
    const x = changetype<Rec>(a);
    const y = changetype<Rec>(b);
    if (x.typeName() != y.typeName()) return false;
    for (let i = 0; i < x.nFields(); i++) if (!eq(x.fieldAt(i), y.fieldAt(i))) return false;
    return true;
  }
  if (a instanceof Num) return b instanceof Num && changetype<Num>(a).v == changetype<Num>(b).v;
  if (a instanceof Str) return b instanceof Str && changetype<Str>(a).v == changetype<Str>(b).v;
  if (a instanceof Sym) {
    if (!(b instanceof Sym)) return false;
    return changetype<Sym>(a).ns == changetype<Sym>(b).ns && changetype<Sym>(a).name == changetype<Sym>(b).name;
  }
  if (a instanceof Kw) {
    if (!(b instanceof Kw)) return false;
    const x = changetype<Kw>(a);
    const y = changetype<Kw>(b);
    return x.ns == y.ns && x.name == y.name;
  }
  if (a instanceof LazySeq || b instanceof LazySeq) {
    if (!(a instanceof LazySeq || a instanceof Vec) || !(b instanceof LazySeq || b instanceof Vec)) return false;
    let x = sq(a);
    let y = sq(b);
    while (x !== null && y !== null) {
      if (!eq(x.h, y.h)) return false;
      x = sq(x.t);
      y = sq(y.t);
    }
    return x === null && y === null;
  }
  if (a instanceof Vec) {
    if (!(b instanceof Vec)) return false;
    const x = changetype<Vec>(a);
    const y = changetype<Vec>(b);
    if (x.n != y.n) return false;
    for (let i = 0; i < x.n; i++) if (!eq(unchecked(x.a[i]), unchecked(y.a[i]))) return false;
    return true;
  }
  if (a instanceof MapV) {
    if (!(b instanceof MapV)) return false;
    const x = changetype<MapV>(a);
    const y = changetype<MapV>(b);
    if (x.n != y.n) return false;
    for (let i = 0; i < x.n; i++) {
      const j = mapFind(y, unchecked(x.keys[i]));
      if (j < 0 || !eq(unchecked(x.vals[i]), unchecked(y.vals[j]))) return false;
    }
    return true;
  }
  if (a instanceof SetV) {
    if (!(b instanceof SetV)) return false;
    const x = changetype<SetV>(a).m;
    const y = changetype<SetV>(b).m;
    if (x.n != y.n) return false;
    for (let i = 0; i < x.n; i++) if (mapFind(y, unchecked(x.keys[i])) < 0) return false;
    return true;
  }
  return false;
}

// -- map internals

function idxInsert(idx: Int32Array, keys: Array<Value>, pos: i32): void {
  const mask = idx.length - 1;
  let i = hashOf(unchecked(keys[pos])) & mask;
  while (unchecked(idx[i]) != 0) i = (i + 1) & mask;
  unchecked((idx[i] = pos + 1));
}

function buildIndex(keys: Array<Value>, n: i32): Int32Array {
  let size: i32 = 16;
  while (size < n * 2 + 2) size <<= 1;
  const idx = new Int32Array(size);
  for (let i = 0; i < n; i++) idxInsert(idx, keys, i);
  return idx;
}

function mapFind(m: MapV, k: Value): i32 {
  const n = m.n;
  if (n <= INDEX_MIN) {
    for (let i = 0; i < n; i++) if (eq(unchecked(m.keys[i]), k)) return i;
    return -1;
  }
  let idx = m.idx;
  if (idx === null) {
    idx = buildIndex(m.keys, n);
    m.idx = idx;
  }
  const mask = idx.length - 1;
  let i = hashOf(k) & mask;
  while (true) {
    const p = unchecked(idx[i]);
    if (p == 0) return -1;
    // entries at positions >= n belong to a newer map sharing this table
    if (p - 1 < n && eq(unchecked(m.keys[p - 1]), k)) return p - 1;
    i = (i + 1) & mask;
  }
  return -1;
}

export function copyN(a: Array<Value>, n: i32): Array<Value> {
  const out = new Array<Value>(n);
  for (let i = 0; i < n; i++) unchecked((out[i] = a[i]));
  return out;
}

export function mapAssoc(m: MapV, k: Value, v: Value): MapV {
  const j = mapFind(m, k);
  if (j >= 0) {
    const vals = copyN(m.vals, m.n);
    vals[j] = v;
    return new MapV(m.keys, vals, m.n, m.idx);
  }
  const n = m.n;
  if (m.keys.length == n && m.vals.length == n) {
    m.keys.push(k);
    m.vals.push(v);
    let idx = m.idx;
    if (n + 1 > INDEX_MIN) {
      if (idx === null || (n + 1) * 2 > idx.length) idx = buildIndex(m.keys, n + 1);
      else idxInsert(idx, m.keys, n);
    }
    return new MapV(m.keys, m.vals, n + 1, idx);
  }
  const keys = copyN(m.keys, n);
  const vals = copyN(m.vals, n);
  keys.push(k);
  vals.push(v);
  return new MapV(keys, vals, n + 1, null);
}

export function mkVec(items: Array<Value>): Value {
  return new Vec(items, items.length, false);
}

export function mkMap(kv: Array<Value>): Value {
  let m = changetype<MapV>(EMPTY_MAP);
  for (let i = 0; i + 1 < kv.length; i += 2) m = mapAssoc(m, kv[i], kv[i + 1]);
  return m;
}

export function vector(args: Array<Value>): Value {
  return mkVec(args);
}
export function hashMap(args: Array<Value>): Value {
  if (args.length % 2 != 0) abort("hash-map requires an even number of arguments");
  return mkMap(args);
}

function asVec(v: Value): Vec {
  if (v instanceof Vec) return changetype<Vec>(v);
  abort("Value is not a vector");
  return unreachable();
}

export function kcount(v: Value): Value {
  if (v === NIL) return mkNum(0);
  if (v instanceof Rec) return mkNum(<f64>changetype<Rec>(v).nFields());
  if (v instanceof Vec) return mkNum(<f64>changetype<Vec>(v).n);
  if (v instanceof MapV) return mkNum(<f64>changetype<MapV>(v).n);
  if (v instanceof SetV) return mkNum(<f64>changetype<SetV>(v).m.n);
  if (v instanceof Str) return mkNum(<f64>changetype<Str>(v).v.length);
  if (v instanceof LazySeq) return mkNum(<f64>lazyItems(v).length);
  abort("count not supported on this value");
  return NIL;
}

export function kempty(v: Value): bool {
  if (v instanceof LazySeq) return sq(v) === null;
  return toF64(kcount(v)) == 0;
}

export function kconj(c: Value, x: Value): Value {
  if (c === NIL) return new Vec([x], 1, true);
  if (c instanceof Vec) {
    const v = changetype<Vec>(c);
    if (v.list) {
      const a = new Array<Value>();
      a.push(x);
      for (let i = 0; i < v.n; i++) a.push(unchecked(v.a[i]));
      return new Vec(a, a.length, true);
    }
    if (v.a.length == v.n) {
      v.a.push(x);
      return new Vec(v.a, v.n + 1, false);
    }
    const a = copyN(v.a, v.n);
    a.push(x);
    return new Vec(a, v.n + 1, false);
  }
  if (c instanceof LazySeq) return new ConsSeq(x, c);
  if (c instanceof SetV) return setAdd(changetype<SetV>(c), x);
  if (c instanceof MapV) {
    if (x instanceof Vec && changetype<Vec>(x).n == 2) {
      const e = changetype<Vec>(x);
      return mapAssoc(changetype<MapV>(c), unchecked(e.a[0]), unchecked(e.a[1]));
    }
    if (x instanceof MapV) {
      let m = changetype<MapV>(c);
      const o = changetype<MapV>(x);
      for (let i = 0; i < o.n; i++) m = mapAssoc(m, unchecked(o.keys[i]), unchecked(o.vals[i]));
      return m;
    }
  }
  abort("conj not supported on this value");
  return NIL;
}

export function kconjN(c: Value, xs: Array<Value>): Value {
  let r = c;
  for (let i = 0; i < xs.length; i++) r = kconj(r, xs[i]);
  return r;
}

export function knth3(c: Value, i: Value, dflt: Value, hasDefault: bool): Value {
  const idx = <i32>toF64(i);
  if (c instanceof Vec) {
    const v = changetype<Vec>(c);
    if (idx >= 0 && idx < v.n) return unchecked(v.a[idx]);
  } else if (c instanceof Str) {
    const s = changetype<Str>(c).v;
    if (idx >= 0 && idx < s.length) return new Str(s.charAt(idx));
  } else if (c instanceof LazySeq) {
    let s = idx >= 0 ? sq(c) : null;
    for (let k = idx; s !== null && k > 0; k--) s = sq(s.t);
    if (s !== null) return s.h;
  } else if (c === NIL) {
    if (hasDefault) return dflt;
    return NIL;
  } else abort("nth not supported on this value");
  if (hasDefault) return dflt;
  abort("Index out of bounds");
  return NIL;
}
export function knth(c: Value, i: Value): Value {
  return knth3(c, i, NIL, false);
}

export function kget3(c: Value, k: Value, dflt: Value): Value {
  if (c instanceof Rec) {
    const r = changetype<Rec>(c);
    const i = recIndex(r, k);
    return i >= 0 ? r.fieldAt(i) : dflt;
  }
  if (c instanceof SetV) {
    const m = changetype<SetV>(c).m;
    const j = mapFind(m, k);
    return j >= 0 ? unchecked(m.keys[j]) : dflt;
  }
  if (c instanceof MapV) {
    const m = changetype<MapV>(c);
    const j = mapFind(m, k);
    return j >= 0 ? unchecked(m.vals[j]) : dflt;
  }
  if (c instanceof Vec) {
    if (k instanceof Num) {
      const f = changetype<Num>(k).v;
      const i = <i32>f;
      const v = changetype<Vec>(c);
      if (<f64>i == f && i >= 0 && i < v.n) return unchecked(v.a[i]);
    }
    return dflt;
  }
  return dflt;
}
export function kget(c: Value, k: Value): Value {
  return kget3(c, k, NIL);
}

export function kassoc(c: Value, k: Value, v: Value): Value {
  if (c instanceof Rec) {
    const r = changetype<Rec>(c);
    const i = recIndex(r, k);
    if (i < 0) abort("assoc of a key that is not a field is not supported on records");
    return r.withFieldAt(i, v);
  }
  if (c === NIL) return mapAssoc(changetype<MapV>(EMPTY_MAP), k, v);
  if (c instanceof MapV) return mapAssoc(changetype<MapV>(c), k, v);
  if (c instanceof Vec) {
    const x = changetype<Vec>(c);
    const i = <i32>toF64(k);
    if (i == x.n) return kconj(c, v);
    if (i < 0 || i > x.n) abort("Index out of bounds");
    const a = copyN(x.a, x.n);
    a[i] = v;
    return new Vec(a, x.n, x.list);
  }
  abort("assoc not supported on this value");
  return NIL;
}

export function kassocN(c: Value, kvs: Array<Value>): Value {
  if (kvs.length % 2 != 0) abort("assoc expects an even number of key/value arguments");
  let r = c;
  for (let i = 0; i < kvs.length; i += 2) r = kassoc(r, kvs[i], kvs[i + 1]);
  return r;
}

export function kdissoc(c: Value, k: Value): Value {
  if (c === NIL) return NIL;
  if (!(c instanceof MapV)) {
    abort("dissoc requires a map");
    return NIL;
  }
  const m = changetype<MapV>(c);
  const j = mapFind(m, k);
  if (j < 0) return c;
  const keys = new Array<Value>();
  const vals = new Array<Value>();
  for (let i = 0; i < m.n; i++) {
    if (i == j) continue;
    keys.push(unchecked(m.keys[i]));
    vals.push(unchecked(m.vals[i]));
  }
  return new MapV(keys, vals, keys.length, null);
}

export function kcontains(c: Value, k: Value): bool {
  if (c instanceof Rec) return recIndex(changetype<Rec>(c), k) >= 0;
  if (c instanceof MapV) return mapFind(changetype<MapV>(c), k) >= 0;
  if (c instanceof SetV) return mapFind(changetype<SetV>(c).m, k) >= 0;
  if (c instanceof Vec && k instanceof Num) {
    const f = changetype<Num>(k).v;
    return f >= 0 && f < <f64>changetype<Vec>(c).n && f == Math.floor(f);
  }
  return false;
}

export function kkeys(c: Value): Value {
  if (c === NIL) return NIL;
  const m = changetype<MapV>(c);
  if (!(c instanceof MapV)) abort("keys requires a map");
  return new Vec(copyN(m.keys, m.n), m.n, true);
}
export function kvals(c: Value): Value {
  if (c === NIL) return NIL;
  const m = changetype<MapV>(c);
  if (!(c instanceof MapV)) abort("vals requires a map");
  return new Vec(copyN(m.vals, m.n), m.n, true);
}

export function kfirst(c: Value): Value {
  if (c instanceof Vec) {
    const v = changetype<Vec>(c);
    return v.n > 0 ? unchecked(v.a[0]) : NIL;
  }
  const s = sq(c);
  return s === null ? NIL : s.h;
}
export function ksecond(c: Value): Value {
  const s = sq(c);
  if (s === null) return NIL;
  const s2 = sq(s.t);
  return s2 === null ? NIL : s2.h;
}
export function klast(c: Value): Value {
  if (c instanceof Vec) {
    const v = changetype<Vec>(c);
    return v.n > 0 ? unchecked(v.a[v.n - 1]) : NIL;
  }
  const a = items(c);
  return a.length > 0 ? a[a.length - 1] : NIL;
}
export function kpeek(c: Value): Value {
  if (c instanceof Vec && changetype<Vec>(c).list) return kfirst(c);
  return klast(c);
}
export function kpop(c: Value): Value {
  const v = asVec(c);
  if (v.n == 0) abort("Can't pop empty collection");
  if (v.list) return listOf(copyN(v.a, v.n).slice(1));
  return new Vec(v.a, v.n - 1, false);
}

export function kvec(c: Value): Value {
  if (c === NIL) return EMPTY_VEC;
  if (!(c instanceof Vec)) {
    const a = items(c);
    return new Vec(copyN(a, a.length), a.length, false);
  }
  const v = asVec(c);
  return new Vec(copyN(v.a, v.n), v.n, false);
}

export function isNil(v: Value): bool {
  return v === NIL;
}
export function isSome(v: Value): bool {
  return v !== NIL;
}
export function isNumber(v: Value): bool {
  return v instanceof Num;
}
export function isString(v: Value): bool {
  return v instanceof Str;
}
export function isKeyword(v: Value): bool {
  return v instanceof Kw;
}
export function isVector(v: Value): bool {
  return v instanceof Vec && !changetype<Vec>(v).list;
}
export function isMap(v: Value): bool {
  return v instanceof MapV;
}
export function isEven(v: Value): bool {
  return toF64(v) % 2 == 0;
}
export function isOdd(v: Value): bool {
  return toF64(v) % 2 != 0;
}
export function identity(v: Value): Value {
  return v;
}
export function kmax(a: Value, b: Value): Value {
  return toF64(a) >= toF64(b) ? a : b;
}
export function kmin(a: Value, b: Value): Value {
  return toF64(a) <= toF64(b) ? a : b;
}

// -- Calling any callable value ------------------------------------------------

export function callV0(f: Value): Value {
  return asFn(f).call0();
}
export function callV1(f: Value, a: Value): Value {
  if (f instanceof Fn) return changetype<Fn>(f).call1(a);
  if (f instanceof Kw) return kget(a, f);
  if (f instanceof MapV || f instanceof SetV) return kget(f, a);
  if (f instanceof Vec) return knth(f, a);
  return asFn(f).call1(a);
}
export function callV2(f: Value, a: Value, b: Value): Value {
  if (f instanceof Fn) return changetype<Fn>(f).call2(a, b);
  if (f instanceof Kw) return kget3(a, f, b);
  if (f instanceof MapV || f instanceof SetV) return kget3(f, a, b);
  return asFn(f).call2(a, b);
}
export function callV3(f: Value, a: Value, b: Value, c: Value): Value {
  return asFn(f).call3(a, b, c);
}
export function callVN(f: Value, args: Array<Value>): Value {
  if (f instanceof Fn) return changetype<Fn>(f).invoke(args);
  if (args.length == 1) return callV1(f, args[0]);
  if (args.length == 2) return callV2(f, args[0], args[1]);
  return asFn(f).invoke(args);
}

export function kreduce3(f: Value, init: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  let acc = init;
  for (let i = 0; i < n; i++) acc = callV2(f, acc, unchecked(a[i]));
  return acc;
}
export function kreduce2(f: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  if (n == 0) return callV0(f);
  let acc = unchecked(a[0]);
  for (let i = 1; i < n; i++) acc = callV2(f, acc, unchecked(a[i]));
  return acc;
}

export function kupdate(m: Value, k: Value, f: Value, extra: Array<Value>): Value {
  const cur = kget(m, k);
  let nv: Value;
  if (extra.length == 0) nv = callV1(f, cur);
  else {
    const args = new Array<Value>();
    args.push(cur);
    for (let i = 0; i < extra.length; i++) args.push(extra[i]);
    nv = callVN(f, args);
  }
  return kassoc(m, k, nv);
}

export function kgetIn3(m: Value, path: Value, dflt: Value): Value {
  const p = asVec(path);
  let cur = m;
  for (let i = 0; i < p.n; i++) {
    if (!kcontains(cur, unchecked(p.a[i]))) return dflt;
    cur = kget(cur, unchecked(p.a[i]));
  }
  return cur;
}
export function kgetIn(m: Value, path: Value): Value {
  return kgetIn3(m, path, NIL);
}

// -- Records and reify (D23) ---------------------------------------------------

/** Base of generated defrecord classes; field access is by index so the generic ops need no reflection. */
export abstract class Rec extends Value {
  abstract typeName(): string;
  abstract nFields(): i32;
  abstract fieldName(i: i32): string;
  abstract fieldAt(i: i32): Value;
  abstract withFieldAt(i: i32, v: Value): Rec;
}

function recIndex(r: Rec, k: Value): i32 {
  if (!(k instanceof Kw)) return -1;
  const kw = changetype<Kw>(k);
  if (kw.ns.length > 0) return -1;
  for (let i = 0; i < r.nFields(); i++) if (r.fieldName(i) == kw.name) return i;
  return -1;
}

/** `reify` instance: protocol method implementations keyed "Protocol/method/argc". */
export class Reified extends Value {
  constructor(
    public keys: Array<string>,
    public fns: Array<Fn>,
  ) {
    super();
  }
  find(key: string): Fn | null {
    for (let i = 0; i < this.keys.length; i++) if (this.keys[i] == key) return this.fns[i];
    return null;
  }
}

export function noImpl(protocol: string, method: string, v: Value): Value {
  abort("No implementation of method " + method + " of protocol " + protocol + " found for " + toStr(v, true));
  return NIL;
}

// -- Sets, lists/seqs, higher-order functions (D21) ----------------------------

export class SetV extends Value {
  constructor(public m: MapV) {
    super();
  }
}
export const EMPTY_SET: Value = new SetV(changetype<MapV>(EMPTY_MAP));

export class ExInfo extends Value {
  constructor(
    public msg: string,
    public data: Value,
  ) {
    super();
  }
}

function setAdd(s: SetV, x: Value): Value {
  if (mapFind(s.m, x) >= 0) return s;
  return new SetV(mapAssoc(s.m, x, TRUE));
}

export function mkSet(xs: Array<Value>): Value {
  let m = changetype<MapV>(EMPTY_MAP);
  for (let i = 0; i < xs.length; i++) if (mapFind(m, xs[i]) < 0) m = mapAssoc(m, xs[i], TRUE);
  return new SetV(m);
}
export function hashSet(args: Array<Value>): Value {
  return mkSet(args);
}
export function kset(c: Value): Value {
  return mkSet(items(c));
}
export function kdisj(s: Value, k: Value): Value {
  if (s === NIL) return NIL;
  if (!(s instanceof SetV)) {
    abort("disj requires a set");
    return NIL;
  }
  const m = changetype<SetV>(s).m;
  const r = kdissoc(m, k);
  return r === m ? s : new SetV(changetype<MapV>(r));
}
export function isSet(v: Value): bool {
  return v instanceof SetV;
}
export function isList(v: Value): bool {
  return v instanceof Vec && changetype<Vec>(v).list;
}
export function isSeq(v: Value): bool {
  return isList(v) || v instanceof LazySeq;
}

/** Read-only element view of any seqable. Callers must capture `length` before looping. */
export function items(c: Value): Array<Value> {
  if (c === NIL) return new Array<Value>(0);
  if (c instanceof Vec) {
    const v = changetype<Vec>(c);
    return v.n == v.a.length ? v.a : copyN(v.a, v.n);
  }
  if (c instanceof LazySeq) return lazyItems(c);
  if (c instanceof MapV) {
    const m = changetype<MapV>(c);
    const out = new Array<Value>();
    for (let i = 0; i < m.n; i++) out.push(new Vec([unchecked(m.keys[i]), unchecked(m.vals[i])], 2, false));
    return out;
  }
  if (c instanceof SetV) {
    const m = changetype<SetV>(c).m;
    return copyN(m.keys, m.n);
  }
  if (c instanceof Str) {
    const s = changetype<Str>(c).v;
    const out = new Array<Value>();
    for (let i = 0; i < s.length; i++) out.push(new Str(s.charAt(i)));
    return out;
  }
  abort("Value is not seqable");
  return unreachable();
}

function listOf(a: Array<Value>): Value {
  return new Vec(a, a.length, true);
}

export function restOf(args: Array<Value>, from: i32): Value {
  if (args.length <= from) return NIL;
  const out = new Array<Value>();
  for (let i = from; i < args.length; i++) out.push(args[i]);
  return listOf(out);
}
export function klist(args: Array<Value>): Value {
  return listOf(args);
}
export function kseq(c: Value): Value {
  if (c === NIL) return NIL;
  if (c instanceof LazySeq) {
    const s = sq(c);
    return s === null ? NIL : s;
  }
  if (c instanceof Vec && changetype<Vec>(c).list) return changetype<Vec>(c).n > 0 ? c : NIL;
  const a = items(c);
  return a.length == 0 ? NIL : listOf(copyN(a, a.length));
}
export function krest(c: Value): Value {
  const s = sq(c);
  if (s === null || s.t === NIL) return listOf([]);
  return s.t;
}
export function knext(c: Value): Value {
  const s = sq(c);
  if (s === null) return NIL;
  const s2 = sq(s.t);
  return s2 === null ? NIL : s2;
}
export function kcons(x: Value, c: Value): Value {
  return new ConsSeq(x, c);
}
export function kemptyOf(c: Value): Value {
  if (c instanceof MapV) return EMPTY_MAP;
  if (c instanceof SetV) return EMPTY_SET;
  if (c instanceof Vec) return changetype<Vec>(c).list ? listOf([]) : EMPTY_VEC;
  if (c instanceof LazySeq) return listOf([]);
  return NIL;
}
export function kreverse(c: Value): Value {
  const a = items(c);
  const n = a.length;
  const out = new Array<Value>();
  for (let i = n - 1; i >= 0; i--) out.push(unchecked(a[i]));
  return listOf(out);
}
export function kconcat(args: Array<Value>): Value {
  if (args.length == 0) return listOf([]);
  return new ConcatSeq(args[0], args, 1);
}
export function ktake(cnt: Value, c: Value): Value {
  return new TakeSeq(<i32>toF64(cnt), c);
}
export function kdrop(cnt: Value, c: Value): Value {
  return new DropSeq(<i32>toF64(cnt), c);
}
export function kmap2(f: Value, c: Value): Value {
  return new MapSeq(f, c);
}
export function kmap3(f: Value, c1: Value, c2: Value): Value {
  return new MapSeq2(f, c1, c2);
}
export function kmapv(f: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  const out = new Array<Value>();
  for (let i = 0; i < n; i++) out.push(callV1(f, unchecked(a[i])));
  return new Vec(out, out.length, false);
}
export function kfilter(f: Value, c: Value): Value {
  return new FilterSeq(f, c, true);
}
export function kfilterv(f: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  const out = new Array<Value>();
  for (let i = 0; i < n; i++) if (truthy(callV1(f, unchecked(a[i])))) out.push(unchecked(a[i]));
  return new Vec(out, out.length, false);
}
export function kremove(f: Value, c: Value): Value {
  return new FilterSeq(f, c, false);
}
export function ksome(f: Value, c: Value): Value {
  let s = sq(c);
  while (s !== null) {
    const r = callV1(f, s.h);
    if (truthy(r)) return r;
    s = sq(s.t);
  }
  return NIL;
}
export function kevery(f: Value, c: Value): bool {
  let s = sq(c);
  while (s !== null) {
    if (!truthy(callV1(f, s.h))) return false;
    s = sq(s.t);
  }
  return true;
}
export function kinto(to: Value, from: Value): Value {
  const a = items(from);
  const n = a.length;
  let r = to;
  for (let i = 0; i < n; i++) r = kconj(r, unchecked(a[i]));
  return r;
}
// Ranges up to this many elements are materialized (indistinguishable from lazy: no side effects).
const RANGE_EAGER_MAX: f64 = 65536;
export function krange3(start: Value, end: Value, step: Value): Value {
  const s = toF64(start);
  const e = toF64(end);
  const st = toF64(step);
  if (st == 0) abort("range step must not be zero");
  const cnt = Math.ceil((e - s) / st);
  if (!(cnt <= RANGE_EAGER_MAX)) return new RangeSeq(s, e, st);
  const out = new Array<Value>();
  if (st > 0) for (let x = s; x < e; x += st) out.push(mkNum(x));
  else for (let x = s; x > e; x += st) out.push(mkNum(x));
  return listOf(out);
}
export function krange2(start: Value, end: Value): Value {
  return krange3(start, end, mkNum(1));
}
export function krange1(end: Value): Value {
  return krange3(mkNum(0), end, mkNum(1));
}
export function kapply(f: Value, lead: Array<Value>, c: Value): Value {
  const a = items(c);
  const args = new Array<Value>();
  for (let i = 0; i < lead.length; i++) args.push(lead[i]);
  const n = a.length;
  for (let i = 0; i < n; i++) args.push(unchecked(a[i]));
  return callVN(f, args);
}
export function kexInfo(msg: Value, data: Value): Value {
  return new ExInfo(toStr(msg, false), data);
}
export function kexMessage(e: Value): Value {
  return e instanceof ExInfo ? new Str(changetype<ExInfo>(e).msg) : NIL;
}
export function kexData(e: Value): Value {
  return e instanceof ExInfo ? changetype<ExInfo>(e).data : NIL;
}

// -- host/ functions: the same names a CLI host provides (D22) --------------------

function optStr(s: string | null): Value {
  return s === null ? NIL : new Str(s);
}
export function hostArgs(): Value {
  const n = hostArgc();
  const out = new Array<Value>();
  for (let i = 0; i < n; i++) out.push(new Str(hostArg(i)));
  return n == 0 ? NIL : listOf(out);
}
export function hostEnvGet(name: Value): Value {
  return optStr(hostEnv(toStr(name, false)));
}
export function hostReadFileV(path: Value): Value {
  return optStr(hostReadFile(toStr(path, false)));
}
export function hostWriteFileV(path: Value, content: Value): Value {
  return bool_(hostWriteFile(toStr(path, false), toStr(content, false)));
}
export function hostStdinV(): Value {
  return new Str(hostStdin());
}
export function hostExitV(code: Value): Value {
  hostExit(<i32>toF64(code));
  return NIL;
}
export function hostNowV(): Value {
  return mkNum(hostNow());
}

// -- Printing ----------------------------------------------------------------

export function fmtNum(n: f64): string {
  if (n != n) return "NaN";
  if (n == Infinity) return "Infinity";
  if (n == -Infinity) return "-Infinity";
  if (n == Math.floor(n) && Math.abs(n) < 1e15) return (<i64>n).toString();
  return n.toString();
}

function quote(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c == 34) out += '\\"';
    else if (c == 92) out += "\\\\";
    else if (c == 10) out += "\\n";
    else out += s.charAt(i);
  }
  return out + '"';
}

export function toStr(v: Value, readable: bool): string {
  if (v === NIL) return readable ? "nil" : "";
  if (v instanceof Rec) {
    const r = changetype<Rec>(v);
    let out = "#" + r.typeName() + "{";
    for (let i = 0; i < r.nFields(); i++) {
      if (i > 0) out += ", ";
      out += ":" + r.fieldName(i) + " " + elemStr(r.fieldAt(i), readable);
    }
    return out + "}";
  }
  if (v instanceof Reified) return "#object[reify]";
  if (v === TRUE) return "true";
  if (v === FALSE) return "false";
  if (v instanceof Num) return fmtNum(changetype<Num>(v).v);
  if (v instanceof Str) {
    const s = changetype<Str>(v).v;
    return readable ? quote(s) : s;
  }
  if (v instanceof Sym) {
    const k = changetype<Sym>(v);
    return k.ns.length > 0 ? k.ns + "/" + k.name : k.name;
  }
  if (v instanceof Kw) {
    const k = changetype<Kw>(v);
    return k.ns.length > 0 ? ":" + k.ns + "/" + k.name : ":" + k.name;
  }
  if (v instanceof Vec) {
    const x = changetype<Vec>(v);
    let out = x.list ? "(" : "[";
    for (let i = 0; i < x.n; i++) {
      if (i > 0) out += " ";
      out += elemStr(unchecked(x.a[i]), readable);
    }
    return out + (x.list ? ")" : "]");
  }
  if (v instanceof LazySeq) {
    const a = lazyItems(v);
    let out = "(";
    for (let i = 0; i < a.length; i++) {
      if (i > 0) out += " ";
      out += elemStr(a[i], readable);
    }
    return out + ")";
  }
  if (v instanceof MapV) {
    const m = changetype<MapV>(v);
    let out = "{";
    for (let i = 0; i < m.n; i++) {
      if (i > 0) out += ", ";
      out += elemStr(unchecked(m.keys[i]), readable) + " " + elemStr(unchecked(m.vals[i]), readable);
    }
    return out + "}";
  }
  if (v instanceof SetV) {
    const m = changetype<SetV>(v).m;
    let out = "#{";
    for (let i = 0; i < m.n; i++) {
      if (i > 0) out += " ";
      out += elemStr(unchecked(m.keys[i]), readable);
    }
    return out + "}";
  }
  if (v instanceof ExInfo) return "#error " + changetype<ExInfo>(v).msg;
  if (v instanceof Fn) return "#<fn>";
  return "#<object>";
}

// nil inside a collection prints as "nil" even for println
function elemStr(v: Value, readable: bool): string {
  return v === NIL ? "nil" : toStr(v, readable);
}

export function println(args: Array<Value>): Value {
  let out = "";
  for (let i = 0; i < args.length; i++) {
    if (i > 0) out += " ";
    out += args[i] === NIL ? "nil" : toStr(args[i], false);
  }
  hostWrite(out + "\n");
  return NIL;
}

export function prn(args: Array<Value>): Value {
  let out = "";
  for (let i = 0; i < args.length; i++) {
    if (i > 0) out += " ";
    out += toStr(args[i], true);
  }
  hostWrite(out + "\n");
  return NIL;
}

export function prStr(args: Array<Value>): Value {
  let out = "";
  for (let i = 0; i < args.length; i++) {
    if (i > 0) out += " ";
    out += toStr(args[i], true);
  }
  return new Str(out);
}

export function str(args: Array<Value>): Value {
  let out = "";
  for (let i = 0; i < args.length; i++) out += toStr(args[i], false);
  return new Str(out);
}

// -- Lazy sequences ------------------------------------------------------------
// A LazySeq is one cell of a seq: `compute()` runs at most once and fills `ne` (non-empty),
// `h` (first) and `t` (rest, any seqable). Cells cache, so side effects run once per element.
// Unlike Clojure there is no 32-element chunking: `map`/`filter` realize one element at a time.

export abstract class LazySeq extends Value {
  done: bool = false;
  ne: bool = false;
  h: Value = NIL;
  t: Value = NIL;
  abstract compute(): void;
  force(): LazySeq {
    if (!this.done) {
      this.compute();
      this.done = true;
    }
    return this;
  }
  cell(h: Value, t: Value): void {
    this.ne = true;
    this.h = h;
    this.t = t;
  }
  fillFrom(c: Value): void {
    const s = sq(c);
    if (s === null) this.ne = false;
    else this.cell(s.h, s.t);
  }
}

/** The forced, non-empty cell for any seqable, or null when it is empty. */
export function sq(c: Value): LazySeq | null {
  if (c === NIL) return null;
  if (c instanceof LazySeq) {
    const l = changetype<LazySeq>(c).force();
    return l.ne ? l : null;
  }
  if (c instanceof Vec) {
    const v = changetype<Vec>(c);
    if (v.n == 0) return null;
    return new ArrSeq(v.a, 0, v.n).force();
  }
  const a = items(c);
  if (a.length == 0) return null;
  return new ArrSeq(a, 0, a.length).force();
}

class ArrSeq extends LazySeq {
  constructor(
    public a: Array<Value>,
    public i: i32,
    public n: i32,
  ) {
    super();
  }
  compute(): void {
    this.cell(unchecked(this.a[this.i]), this.i + 1 < this.n ? new ArrSeq(this.a, this.i + 1, this.n) : NIL);
  }
}

class ConsSeq extends LazySeq {
  constructor(x: Value, rest: Value) {
    super();
    this.done = true;
    this.cell(x, rest);
  }
  compute(): void {}
}

class ThunkSeq extends LazySeq {
  constructor(public f: Value) {
    super();
  }
  compute(): void {
    this.fillFrom(callV0(this.f));
  }
}

class MapSeq extends LazySeq {
  constructor(
    public f: Value,
    public src: Value,
  ) {
    super();
  }
  compute(): void {
    const s = sq(this.src);
    if (s === null) return;
    this.cell(callV1(this.f, s.h), new MapSeq(this.f, s.t));
  }
}

class MapSeq2 extends LazySeq {
  constructor(
    public f: Value,
    public a: Value,
    public b: Value,
  ) {
    super();
  }
  compute(): void {
    const x = sq(this.a);
    if (x === null) return;
    const y = sq(this.b);
    if (y === null) return;
    this.cell(callV2(this.f, x.h, y.h), new MapSeq2(this.f, x.t, y.t));
  }
}

class FilterSeq extends LazySeq {
  constructor(
    public f: Value,
    public src: Value,
    public keep: bool,
  ) {
    super();
  }
  compute(): void {
    let s = sq(this.src);
    while (s !== null) {
      if (truthy(callV1(this.f, s.h)) == this.keep) {
        this.cell(s.h, new FilterSeq(this.f, s.t, this.keep));
        return;
      }
      s = sq(s.t);
    }
  }
}

class TakeSeq extends LazySeq {
  constructor(
    public n: i32,
    public src: Value,
  ) {
    super();
  }
  compute(): void {
    if (this.n <= 0) return;
    const s = sq(this.src);
    if (s === null) return;
    this.cell(s.h, this.n > 1 ? new TakeSeq(this.n - 1, s.t) : NIL);
  }
}

class DropSeq extends LazySeq {
  constructor(
    public n: i32,
    public src: Value,
  ) {
    super();
  }
  compute(): void {
    let s = sq(this.src);
    for (let i = this.n; s !== null && i > 0; i--) s = sq(s.t);
    if (s !== null) this.cell(s.h, s.t);
  }
}

class TakeWhileSeq extends LazySeq {
  constructor(
    public f: Value,
    public src: Value,
  ) {
    super();
  }
  compute(): void {
    const s = sq(this.src);
    if (s === null || !truthy(callV1(this.f, s.h))) return;
    this.cell(s.h, new TakeWhileSeq(this.f, s.t));
  }
}

class DropWhileSeq extends LazySeq {
  constructor(
    public f: Value,
    public src: Value,
  ) {
    super();
  }
  compute(): void {
    let s = sq(this.src);
    while (s !== null && truthy(callV1(this.f, s.h))) s = sq(s.t);
    if (s !== null) this.cell(s.h, s.t);
  }
}

class RangeSeq extends LazySeq {
  constructor(
    public cur: f64,
    public end: f64,
    public step: f64,
  ) {
    super();
  }
  compute(): void {
    if (this.step > 0 ? this.cur >= this.end : this.cur <= this.end) return;
    this.cell(mkNum(this.cur), new RangeSeq(this.cur + this.step, this.end, this.step));
  }
}

class IterateSeq extends LazySeq {
  constructor(
    public f: Value,
    public seed: Value,
    public apply: bool,
  ) {
    super();
  }
  compute(): void {
    const x = this.apply ? callV1(this.f, this.seed) : this.seed;
    this.cell(x, new IterateSeq(this.f, x, true));
  }
}

class RepeatSeq extends LazySeq {
  constructor(
    public x: Value,
    public n: i32,
  ) {
    super();
  }
  compute(): void {
    if (this.n == 0) return;
    this.cell(this.x, this.n == 1 ? NIL : new RepeatSeq(this.x, this.n > 0 ? this.n - 1 : -1));
  }
}

class CycleSeq extends LazySeq {
  constructor(
    public orig: Value,
    public cur: Value,
  ) {
    super();
  }
  compute(): void {
    let s = sq(this.cur);
    if (s === null) s = sq(this.orig);
    if (s === null) return;
    this.cell(s.h, new CycleSeq(this.orig, s.t));
  }
}

class ConcatSeq extends LazySeq {
  constructor(
    public cur: Value,
    public rest: Array<Value>,
    public i: i32,
  ) {
    super();
  }
  compute(): void {
    let cur = this.cur;
    let i = this.i;
    for (;;) {
      const s = sq(cur);
      if (s !== null) {
        this.cell(s.h, new ConcatSeq(s.t, this.rest, i));
        return;
      }
      if (i >= this.rest.length) return;
      cur = this.rest[i];
      i++;
    }
  }
}

class FlatSeq extends LazySeq {
  constructor(
    public inner: Value,
    public outer: Value,
  ) {
    super();
  }
  compute(): void {
    let inner = this.inner;
    let outer = this.outer;
    for (;;) {
      const s = sq(inner);
      if (s !== null) {
        this.cell(s.h, new FlatSeq(s.t, outer));
        return;
      }
      const o = sq(outer);
      if (o === null) return;
      inner = o.h;
      outer = o.t;
    }
  }
}

export function lazySeq(f: Value): Value {
  return new ThunkSeq(f);
}

function lazyItems(c: Value): Array<Value> {
  const out = new Array<Value>();
  let s = sq(c);
  while (s !== null) {
    out.push(s.h);
    s = sq(s.t);
  }
  return out;
}

export function kdoall(c: Value): Value {
  let s = sq(c);
  while (s !== null) s = sq(s.t);
  return c;
}
export function kdorun(c: Value): Value {
  kdoall(c);
  return NIL;
}

export function kiterate(f: Value, x: Value): Value {
  return new IterateSeq(f, x, false);
}
export function krepeat1(x: Value): Value {
  return new RepeatSeq(x, -1);
}
export function krepeat2(n: Value, x: Value): Value {
  const k = <i32>toF64(n);
  return k <= 0 ? listOf([]) : new RepeatSeq(x, k);
}
export function kcycle(c: Value): Value {
  return new CycleSeq(c, c);
}
export function ktakeWhile(f: Value, c: Value): Value {
  return new TakeWhileSeq(f, c);
}
export function kdropWhile(f: Value, c: Value): Value {
  return new DropWhileSeq(f, c);
}
export function kmapcat(f: Value, c: Value): Value {
  return new FlatSeq(NIL, new MapSeq(f, c));
}
export function krange0(): Value {
  return new RangeSeq(0, Infinity, 1);
}

// -- Comparison and sorting ----------------------------------------------------

function typeRank(v: Value): i32 {
  if (v instanceof Num) return 1;
  if (v instanceof Str) return 2;
  if (v instanceof Kw) return 3;
  if (v === TRUE || v === FALSE) return 4;
  if (v instanceof Vec) return 5;
  return 0;
}

export function kcompareI(a: Value, b: Value): i32 {
  if (a === b) return 0;
  if (a === NIL) return -1;
  if (b === NIL) return 1;
  if (a instanceof Num && b instanceof Num) {
    const x = changetype<Num>(a).v;
    const y = changetype<Num>(b).v;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (a instanceof Str && b instanceof Str) {
    const x = changetype<Str>(a).v;
    const y = changetype<Str>(b).v;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (a instanceof Sym && b instanceof Sym) {
    const x = changetype<Sym>(a);
    const y = changetype<Sym>(b);
    if (x.ns != y.ns) return x.ns < y.ns ? -1 : 1;
    return x.name < y.name ? -1 : x.name > y.name ? 1 : 0;
  }
  if (a instanceof Kw && b instanceof Kw) {
    const x = changetype<Kw>(a);
    const y = changetype<Kw>(b);
    if (x.ns != y.ns) return x.ns < y.ns ? -1 : 1;
    return x.name < y.name ? -1 : x.name > y.name ? 1 : 0;
  }
  if ((a === TRUE || a === FALSE) && (b === TRUE || b === FALSE)) return a === FALSE ? -1 : 1;
  if (a instanceof Vec && b instanceof Vec) {
    const x = changetype<Vec>(a);
    const y = changetype<Vec>(b);
    if (x.n != y.n) return x.n < y.n ? -1 : 1;
    for (let i = 0; i < x.n; i++) {
      const c = kcompareI(unchecked(x.a[i]), unchecked(y.a[i]));
      if (c != 0) return c;
    }
    return 0;
  }
  if (typeRank(a) != typeRank(b) || typeRank(a) == 0) abort("Cannot compare these values");
  return 0;
}
export function kcompare(a: Value, b: Value): Value {
  return mkNum(<f64>kcompareI(a, b));
}

// Accepts a 3-way number comparator or a boolean "less than" predicate, like Clojure.
function cmpWith(cmp: Value, a: Value, b: Value): i32 {
  if (cmp === NIL) return kcompareI(a, b);
  const r = callV2(cmp, a, b);
  if (r === TRUE) return -1;
  if (r === FALSE) return truthy(callV2(cmp, b, a)) ? 1 : 0;
  const f = toF64(r);
  return f < 0 ? -1 : f > 0 ? 1 : 0;
}

function msort(idx: Array<i32>, tmp: Array<i32>, lo: i32, hi: i32, keys: Array<Value>, cmp: Value): void {
  if (hi - lo < 2) return;
  const mid = (lo + hi) >> 1;
  msort(idx, tmp, lo, mid, keys, cmp);
  msort(idx, tmp, mid, hi, keys, cmp);
  let i = lo;
  let j = mid;
  let k = lo;
  while (i < mid && j < hi) {
    if (cmpWith(cmp, keys[idx[j]], keys[idx[i]]) < 0) tmp[k++] = idx[j++];
    else tmp[k++] = idx[i++];
  }
  while (i < mid) tmp[k++] = idx[i++];
  while (j < hi) tmp[k++] = idx[j++];
  for (k = lo; k < hi; k++) idx[k] = tmp[k];
}

function sortImpl(keyFn: Value, cmp: Value, c: Value): Value {
  const vals = lazyOrItems(c);
  const n = vals.length;
  let keys = vals;
  if (keyFn !== NIL) {
    keys = new Array<Value>();
    for (let i = 0; i < n; i++) keys.push(callV1(keyFn, vals[i]));
  }
  const idx = new Array<i32>(n);
  const tmp = new Array<i32>(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  msort(idx, tmp, 0, n, keys, cmp);
  const out = new Array<Value>();
  for (let i = 0; i < n; i++) out.push(vals[idx[i]]);
  return listOf(out);
}
function lazyOrItems(c: Value): Array<Value> {
  return items(c);
}
export function ksort1(c: Value): Value {
  return sortImpl(NIL, NIL, c);
}
export function ksort2(cmp: Value, c: Value): Value {
  return sortImpl(NIL, cmp, c);
}
export function ksortBy2(kf: Value, c: Value): Value {
  return sortImpl(kf, NIL, c);
}
export function ksortBy3(kf: Value, cmp: Value, c: Value): Value {
  return sortImpl(kf, cmp, c);
}

// -- core.async (mirrors src/runtime/async.ts) ----------------------------------
//
// Callbacks are queued, never re-entered, so go loops keep a flat stack. The queue is drained by
// kdrain(), which the exported `main` calls after the user's -main returns; when only timers remain
// it sleeps through the host (`host.sleep`) and closes the earliest timeout channel.

@external("host", "sleep")
declare function hostSleep(ms: f64): void;

class Flag {
  done: bool = false;
}

class Waiter {
  constructor(public cb: Value, public val: Value, public flag: Flag, public port: Chan | null) {}
}

class Task {
  constructor(public f: Value, public a: Value, public hasArg: bool) {}
}

class Timer {
  constructor(public at: f64, public ch: Chan) {}
}

export class Chan extends Value {
  buf: Array<Value> = new Array<Value>();
  takers: Array<Waiter> = new Array<Waiter>();
  putters: Array<Waiter> = new Array<Waiter>();
  closed: bool = false;
  // 0 = unbuffered, 1 = fixed, 2 = dropping, 3 = sliding
  kind: i32 = 0;
  n: i32 = 0;
}

export class BufSpec extends Value {
  constructor(public kind: i32, public n: i32) {
    super();
  }
}

const taskQueue: Array<Task> = new Array<Task>();
const timers: Array<Timer> = new Array<Timer>();
let draining: bool = false;

function enq(f: Value, a: Value, hasArg: bool): void {
  if (f === NIL) return;
  taskQueue.push(new Task(f, a, hasArg));
}

export function kdrain(): void {
  if (draining) return;
  draining = true;
  while (true) {
    for (let i = 0; i < taskQueue.length; i++) {
      const t = taskQueue[i];
      if (t.hasArg) callV1(t.f, t.a);
      else callV0(t.f);
    }
    taskQueue.length = 0;
    if (timers.length == 0) break;
    let best = 0;
    for (let i = 1; i < timers.length; i++) if (timers[i].at < timers[best].at) best = i;
    const tm = timers[best];
    timers.splice(best, 1);
    const wait = tm.at - hostNow();
    if (wait > 0) hostSleep(wait);
    chClose(tm.ch);
  }
  draining = false;
}

export function kgoDispatch(f: Value): Value {
  enq(f, NIL, false);
  return NIL;
}

export function kbuffer(n: Value): Value {
  return new BufSpec(1, <i32>toF64(n));
}
export function kdroppingBuffer(n: Value): Value {
  return new BufSpec(2, <i32>toF64(n));
}
export function kslidingBuffer(n: Value): Value {
  return new BufSpec(3, <i32>toF64(n));
}

function newChan(kind: i32, n: i32): Chan {
  const c = new Chan();
  c.kind = kind;
  c.n = n;
  return c;
}

export function kchan0(): Value {
  return newChan(0, 0);
}
export function kchan1(spec: Value): Value {
  if (spec === NIL) return newChan(0, 0);
  if (spec instanceof BufSpec) {
    const b = changetype<BufSpec>(spec);
    return newChan(b.kind, b.n);
  }
  const n = <i32>toF64(spec);
  return n == 0 ? newChan(0, 0) : newChan(1, n);
}

function asChan(v: Value): Chan {
  if (v instanceof Chan) return changetype<Chan>(v);
  abort("Value is not a channel");
  return unreachable();
}

function nextLive(q: Array<Waiter>): Waiter | null {
  while (q.length > 0) {
    const w = q.shift();
    if (!w.flag.done) {
      w.flag.done = true;
      return w;
    }
  }
  return null;
}

function hasLive(q: Array<Waiter>): bool {
  while (q.length > 0 && q[0].flag.done) q.shift();
  return q.length > 0;
}

function fire(w: Waiter, v: Value): void {
  if (w.port === null) {
    enq(w.cb, v, true);
  } else {
    const r = new Array<Value>();
    r.push(v);
    r.push(w.port!);
    enq(w.cb, mkVec(r), true);
  }
}

function canTake(c: Chan): bool {
  return c.buf.length > 0 || hasLive(c.putters) || c.closed;
}

function canPut(c: Chan): bool {
  return c.closed || hasLive(c.takers) || (c.kind != 0 && (c.buf.length < c.n || c.kind != 1));
}

function doTake(c: Chan, cb: Value, port: Chan | null): void {
  if (c.buf.length > 0) {
    const v = c.buf.shift();
    const p = nextLive(c.putters);
    if (p !== null) {
      c.buf.push(p.val);
      fire(p, TRUE);
    }
    fire(new Waiter(cb, NIL, new Flag(), port), v);
    return;
  }
  const p = nextLive(c.putters);
  if (p !== null) {
    fire(p, TRUE);
    fire(new Waiter(cb, NIL, new Flag(), port), p.val);
    return;
  }
  if (c.closed) {
    fire(new Waiter(cb, NIL, new Flag(), port), NIL);
    return;
  }
  c.takers.push(new Waiter(cb, NIL, new Flag(), port));
}

function doPut(c: Chan, v: Value, cb: Value, port: Chan | null): void {
  const me = new Waiter(cb, NIL, new Flag(), port);
  if (c.closed) {
    fire(me, FALSE);
    return;
  }
  const t = nextLive(c.takers);
  if (t !== null) {
    fire(t, v);
    fire(me, TRUE);
    return;
  }
  if (c.kind != 0) {
    if (c.buf.length < c.n) {
      c.buf.push(v);
      fire(me, TRUE);
      return;
    }
    if (c.kind == 2) {
      fire(me, TRUE);
      return;
    }
    if (c.kind == 3) {
      c.buf.shift();
      c.buf.push(v);
      fire(me, TRUE);
      return;
    }
  }
  me.val = v;
  c.putters.push(me);
}

export function kchTake1(c: Value): Value {
  doTake(asChan(c), NIL, null);
  return NIL;
}
export function kchTake2(c: Value, cb: Value): Value {
  doTake(asChan(c), cb, null);
  return NIL;
}

function checkPut(v: Value): void {
  if (v === NIL) abort("Can't put nil on a channel");
}

export function kchPut2(c: Value, v: Value): Value {
  checkPut(v);
  doPut(asChan(c), v, NIL, null);
  return TRUE;
}
export function kchPut3(c: Value, v: Value, cb: Value): Value {
  checkPut(v);
  doPut(asChan(c), v, cb, null);
  return TRUE;
}

function chClose(c: Chan): void {
  if (c.closed) return;
  c.closed = true;
  while (true) {
    const t = nextLive(c.takers);
    if (t === null) break;
    fire(t, NIL);
  }
}

export function kchClose(c: Value): Value {
  chClose(asChan(c));
  return NIL;
}

export function kchOffer(c: Value, v: Value): Value {
  checkPut(v);
  const ch = asChan(c);
  if (!canPut(ch) || ch.closed) return FALSE;
  doPut(ch, v, NIL, null);
  return TRUE;
}

export function ktimeout(ms: Value): Value {
  const c = newChan(0, 0);
  timers.push(new Timer(hostNow() + toF64(ms), c));
  return c;
}

class GoDone extends Fn {
  constructor(public c: Chan) {
    super();
  }
  call1(v: Value): Value {
    if (v !== NIL) doPut(this.c, v, NIL, null);
    chClose(this.c);
    return NIL;
  }
  invoke(args: Array<Value>): Value {
    return this.call1(args.length > 0 ? args[0] : NIL);
  }
}

export function kgoStart(f: Value): Value {
  const c = newChan(1, 1);
  enq(f, new GoDone(c), true);
  return c;
}

class AltsPort {
  constructor(public ch: Chan, public isPut: bool, public val: Value) {}
}

export function kgoAlts(ports: Value, cb: Value): Value {
  const list = items(ports);
  const spec = new Array<AltsPort>();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p instanceof Chan) spec.push(new AltsPort(changetype<Chan>(p), false, NIL));
    else spec.push(new AltsPort(asChan(knth(p, mkNum(0))), true, knth(p, mkNum(1))));
  }
  for (let i = 0; i < spec.length; i++) {
    const s = spec[i];
    if (s.isPut ? canPut(s.ch) : canTake(s.ch)) {
      if (s.isPut) doPut(s.ch, s.val, cb, s.ch);
      else doTake(s.ch, cb, s.ch);
      return NIL;
    }
  }
  const flag = new Flag();
  for (let i = 0; i < spec.length; i++) {
    const s = spec[i];
    const w = new Waiter(cb, s.val, flag, s.ch);
    if (s.isPut) s.ch.putters.push(w);
    else s.ch.takers.push(w);
  }
  return NIL;
}

// -- Atoms -------------------------------------------------------------------

export class Atom extends Value {
  constructor(public v: Value) {
    super();
  }
}
export function katom(v: Value): Value {
  return new Atom(v);
}
export function kderef(a: Value): Value {
  if (a instanceof Atom) return changetype<Atom>(a).v;
  abort("deref: not an atom");
  return NIL;
}
export function kreset(a: Value, v: Value): Value {
  if (a instanceof Atom) {
    changetype<Atom>(a).v = v;
    return v;
  }
  abort("reset!: not an atom");
  return NIL;
}
export function kswap(a: Value, f: Value, args: Array<Value>): Value {
  if (!(a instanceof Atom)) {
    abort("swap!: not an atom");
    return NIL;
  }
  const at = changetype<Atom>(a);
  const all = new Array<Value>();
  all.push(at.v);
  for (let i = 0; i < args.length; i++) all.push(args[i]);
  at.v = callVN(f, all);
  return at.v;
}

// -- More numerics, predicates, names ----------------------------------------

export function kint(x: Value): Value {
  return mkNum(Math.trunc(toF64(x)));
}
export function kquot(a: Value, b: Value): Value {
  return mkNum(Math.trunc(toF64(a) / toF64(b)));
}
export function kbitShl(a: Value, n: Value): Value {
  return mkNum(<f64>(<i64>toF64(a) << <i64>toF64(n)));
}
export function kbitShr(a: Value, n: Value): Value {
  return mkNum(<f64>(<i64>toF64(a) >> <i64>toF64(n)));
}
export function kbitAnd(a: Value, b: Value): Value {
  return mkNum(<f64>(<i64>toF64(a) & <i64>toF64(b)));
}
export function kbitOr(a: Value, b: Value): Value {
  return mkNum(<f64>(<i64>toF64(a) | <i64>toF64(b)));
}
export function kbitXor(a: Value, b: Value): Value {
  return mkNum(<f64>(<i64>toF64(a) ^ <i64>toF64(b)));
}
export function kabs(a: Value): Value {
  return mkNum(Math.abs(toF64(a)));
}
export function kboolean(v: Value): bool {
  return truthy(v);
}
export function isInteger(v: Value): bool {
  if (!(v instanceof Num)) return false;
  const x = changetype<Num>(v).v;
  return Math.floor(x) == x && Math.abs(x) < 9007199254740992.0;
}
export function isFn(v: Value): bool {
  return v instanceof Fn;
}
export function isSequential(v: Value): bool {
  return v instanceof Vec || v instanceof LazySeq;
}
export function isTrue(v: Value): bool {
  return v === TRUE;
}
export function isFalse(v: Value): bool {
  return v === FALSE;
}
export function kname(v: Value): Value {
  if (v instanceof Kw) return new Str(changetype<Kw>(v).name);
  if (v instanceof Sym) return new Str(changetype<Sym>(v).name);
  if (v instanceof Str) return v;
  abort("name: not a keyword or string");
  return NIL;
}
export function ksubs2(s: Value, a: Value): Value {
  return new Str(strOf(s).substring(<i32>toF64(a)));
}
export function ksubs3(s: Value, a: Value, b: Value): Value {
  return new Str(strOf(s).substring(<i32>toF64(a), <i32>toF64(b)));
}
function strOf(v: Value): string {
  if (v instanceof Str) return changetype<Str>(v).v;
  abort("expected a string");
  return "";
}

// -- clojure.string ----------------------------------------------------------

export function cljstrUpperCase(s: Value): Value {
  return new Str(strOf(s).toUpperCase());
}
export function cljstrLowerCase(s: Value): Value {
  return new Str(strOf(s).toLowerCase());
}
export function cljstrTrim(s: Value): Value {
  return new Str(strOf(s).trim());
}
export function cljstrBlank(s: Value): bool {
  return s === NIL || strOf(s).trim().length == 0;
}
export function cljstrStartsWith(s: Value, p: Value): bool {
  return strOf(s).startsWith(strOf(p));
}
export function cljstrEndsWith(s: Value, p: Value): bool {
  return strOf(s).endsWith(strOf(p));
}
export function cljstrIncludes(s: Value, p: Value): bool {
  return strOf(s).includes(strOf(p));
}
export function cljstrReverse(s: Value): Value {
  const t = strOf(s);
  let out = "";
  for (let i = t.length - 1; i >= 0; i--) out += t.charAt(i);
  return new Str(out);
}
export function cljstrReplace(s: Value, a: Value, b: Value): Value {
  return new Str(strOf(s).replaceAll(strOf(a), strOf(b)));
}
export function cljstrJoin1(c: Value): Value {
  return cljstrJoin2(new Str(""), c);
}
export function cljstrJoin2(sep: Value, c: Value): Value {
  const a = items(c);
  const sp = strOf(sep);
  let out = "";
  for (let i = 0; i < a.length; i++) {
    if (i > 0) out += sp;
    out += toStr(a[i], false);
  }
  return new Str(out);
}
export function cljstrSplit(s: Value, sep: Value): Value {
  const parts = strOf(s).split(strOf(sep));
  const out = new Array<Value>();
  for (let i = 0; i < parts.length; i++) out.push(new Str(parts[i]));
  return mkVec(out);
}

export function ksqrt(a: Value): Value {
  return mkNum(Math.sqrt(toF64(a)));
}
export function kpow(a: Value, b: Value): Value {
  return mkNum(Math.pow(toF64(a), toF64(b)));
}
export function kfloor(a: Value): Value {
  return mkNum(Math.floor(toF64(a)));
}
export function kceil(a: Value): Value {
  return mkNum(Math.ceil(toF64(a)));
}

export function ksymbol1(v: Value): Value {
  if (v instanceof Sym) return v;
  const t = strOf(v);
  const i = t.indexOf("/");
  return i > 0 && i < t.length - 1 ? new Sym(t.substring(0, i), t.substring(i + 1)) : new Sym("", t);
}
export function ksymbol2(ns: Value, name: Value): Value {
  return new Sym(ns === NIL ? "" : strOf(ns), strOf(name));
}
export function isSymbol(v: Value): bool {
  return v instanceof Sym;
}
// op: 0 <, 1 >, 2 <=, 3 >=; chained pairwise like Clojure, 1 arg is true
export function kcmpN(op: i32, args: Array<Value>): bool {
  for (let i = 0; i + 1 < args.length; i++) {
    const x = toF64(args[i]);
    const y = toF64(args[i + 1]);
    const ok = op == 0 ? x < y : op == 1 ? x > y : op == 2 ? x <= y : x >= y;
    if (!ok) return false;
  }
  if (args.length == 1) toF64(args[0]);
  return true;
}
