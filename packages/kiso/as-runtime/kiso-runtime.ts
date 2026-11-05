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
  if (a instanceof Num) return b instanceof Num && changetype<Num>(a).v == changetype<Num>(b).v;
  if (a instanceof Str) return b instanceof Str && changetype<Str>(a).v == changetype<Str>(b).v;
  if (a instanceof Kw) {
    if (!(b instanceof Kw)) return false;
    const x = changetype<Kw>(a);
    const y = changetype<Kw>(b);
    return x.ns == y.ns && x.name == y.name;
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

function copyN(a: Array<Value>, n: i32): Array<Value> {
  const out = new Array<Value>(n);
  for (let i = 0; i < n; i++) unchecked((out[i] = a[i]));
  return out;
}

function mapAssoc(m: MapV, k: Value, v: Value): MapV {
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
  if (v instanceof Vec) return mkNum(<f64>changetype<Vec>(v).n);
  if (v instanceof MapV) return mkNum(<f64>changetype<MapV>(v).n);
  if (v instanceof SetV) return mkNum(<f64>changetype<SetV>(v).m.n);
  if (v instanceof Str) return mkNum(<f64>changetype<Str>(v).v.length);
  abort("count not supported on this value");
  return NIL;
}

export function kempty(v: Value): bool {
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
  const a = items(c);
  return a.length > 0 ? a[0] : NIL;
}
export function ksecond(c: Value): Value {
  const a = items(c);
  return a.length > 1 ? a[1] : NIL;
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
  if (v.list) return krest(c);
  return new Vec(v.a, v.n - 1, false);
}

export function kvec(c: Value): Value {
  if (c === NIL) return EMPTY_VEC;
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
  return isList(v);
}

/** Read-only element view of any seqable. Callers must capture `length` before looping. */
export function items(c: Value): Array<Value> {
  if (c === NIL) return new Array<Value>(0);
  if (c instanceof Vec) {
    const v = changetype<Vec>(c);
    return v.n == v.a.length ? v.a : copyN(v.a, v.n);
  }
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
  if (c instanceof Vec && changetype<Vec>(c).list) return changetype<Vec>(c).n > 0 ? c : NIL;
  const a = items(c);
  return a.length == 0 ? NIL : listOf(copyN(a, a.length));
}
export function krest(c: Value): Value {
  const a = items(c);
  const n = a.length;
  const out = new Array<Value>();
  for (let i = 1; i < n; i++) out.push(unchecked(a[i]));
  return listOf(out);
}
export function knext(c: Value): Value {
  const r = krest(c);
  return changetype<Vec>(r).n == 0 ? NIL : r;
}
export function kcons(x: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  const out = new Array<Value>();
  out.push(x);
  for (let i = 0; i < n; i++) out.push(unchecked(a[i]));
  return listOf(out);
}
export function kemptyOf(c: Value): Value {
  if (c instanceof MapV) return EMPTY_MAP;
  if (c instanceof SetV) return EMPTY_SET;
  if (c instanceof Vec) return changetype<Vec>(c).list ? listOf([]) : EMPTY_VEC;
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
  const out = new Array<Value>();
  for (let i = 0; i < args.length; i++) {
    const a = items(args[i]);
    const n = a.length;
    for (let j = 0; j < n; j++) out.push(unchecked(a[j]));
  }
  return listOf(out);
}
export function ktake(cnt: Value, c: Value): Value {
  const a = items(c);
  const k = min(<i32>toF64(cnt), a.length);
  const out = new Array<Value>();
  for (let i = 0; i < k; i++) out.push(unchecked(a[i]));
  return listOf(out);
}
export function kdrop(cnt: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  const out = new Array<Value>();
  for (let i = max(<i32>toF64(cnt), 0); i < n; i++) out.push(unchecked(a[i]));
  return listOf(out);
}
export function kmap2(f: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  const out = new Array<Value>();
  for (let i = 0; i < n; i++) out.push(callV1(f, unchecked(a[i])));
  return listOf(out);
}
export function kmap3(f: Value, c1: Value, c2: Value): Value {
  const a = items(c1);
  const b = items(c2);
  const n = min(a.length, b.length);
  const out = new Array<Value>();
  for (let i = 0; i < n; i++) out.push(callV2(f, unchecked(a[i]), unchecked(b[i])));
  return listOf(out);
}
export function kmapv(f: Value, c: Value): Value {
  const r = changetype<Vec>(kmap2(f, c));
  return new Vec(r.a, r.n, false);
}
export function kfilter(f: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  const out = new Array<Value>();
  for (let i = 0; i < n; i++) if (truthy(callV1(f, unchecked(a[i])))) out.push(unchecked(a[i]));
  return listOf(out);
}
export function kfilterv(f: Value, c: Value): Value {
  const r = changetype<Vec>(kfilter(f, c));
  return new Vec(r.a, r.n, false);
}
export function kremove(f: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  const out = new Array<Value>();
  for (let i = 0; i < n; i++) if (!truthy(callV1(f, unchecked(a[i])))) out.push(unchecked(a[i]));
  return listOf(out);
}
export function ksome(f: Value, c: Value): Value {
  const a = items(c);
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const r = callV1(f, unchecked(a[i]));
    if (truthy(r)) return r;
  }
  return NIL;
}
export function kevery(f: Value, c: Value): bool {
  const a = items(c);
  const n = a.length;
  for (let i = 0; i < n; i++) if (!truthy(callV1(f, unchecked(a[i])))) return false;
  return true;
}
export function kinto(to: Value, from: Value): Value {
  const a = items(from);
  const n = a.length;
  let r = to;
  for (let i = 0; i < n; i++) r = kconj(r, unchecked(a[i]));
  return r;
}
export function krange3(start: Value, end: Value, step: Value): Value {
  const s = toF64(start);
  const e = toF64(end);
  const st = toF64(step);
  const out = new Array<Value>();
  if (st == 0) abort("range step must not be zero");
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

// -- Printing ----------------------------------------------------------------

function fmtNum(n: f64): string {
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
  if (v === TRUE) return "true";
  if (v === FALSE) return "false";
  if (v instanceof Num) return fmtNum(changetype<Num>(v).v);
  if (v instanceof Str) {
    const s = changetype<Str>(v).v;
    return readable ? quote(s) : s;
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
    out += toStr(args[i], false);
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
