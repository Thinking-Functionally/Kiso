// Additional clojure.core functions (kept apart from core.ts); exported through the runtime barrel.

import { seq, toArray } from './seq.js';
import { vector, isVector } from './vector.js';
import { isList, list } from './list.js';
import { hashMap, isHashMap } from './hash-map.js';
import { hashSet, isHashSet } from './hash-set.js';
import { isSortedMap } from './sorted-map.js';
import { isSortedSet } from './sorted-set.js';
import { isKeyword } from './keyword.js';
import { isSymbol } from './symbol.js';
import { equiv } from './equiv.js';
import { map, take, drop, take_while, drop_while, reverse, truthy, nth, invoke } from './core.js';

const call = (f: unknown, ...a: unknown[]): unknown => (typeof f === 'function' ? (f as (...x: unknown[]) => unknown)(...a) : invoke(f, ...a));

export function vec(coll: unknown): unknown {
  if (isVector(coll)) return coll;
  return vector(...toArray(coll as never));
}
export function mapv(f: unknown, ...colls: unknown[]): unknown {
  return vec(map(f, ...colls));
}
export function vector_p(x: unknown): boolean { return isVector(x); }
export function list_p(x: unknown): boolean { return isList(x); }
export function true_p(x: unknown): boolean { return x === true; }
export function false_p(x: unknown): boolean { return x === false; }
export function boolean(x: unknown): boolean { return truthy(x); }
export const hash_map = hashMap;
export const hash_set = hashSet;
export function keyword_p(x: unknown): boolean { return isKeyword(x); }
export function symbol_p(x: unknown): boolean { return isSymbol(x); }
export function map_p(x: unknown): boolean { return isHashMap(x) || isSortedMap(x); }
export function set_p(x: unknown): boolean { return isHashSet(x) || isSortedSet(x); }

export function int(x: unknown): number { return typeof x === 'string' ? x.codePointAt(0)! : Math.trunc(x as number); }
export function char(x: unknown): string { return typeof x === 'string' ? x : String.fromCodePoint(x as number); }
export function char_p(x: unknown): boolean { return typeof x === 'string' && Array.from(x).length === 1; }
export const long = int;
export const short = int;

export function bit_and(a: number, b: number, ...r: number[]): number { return r.reduce((x, y) => x & y, a & b); }
export function bit_or(a: number, b: number, ...r: number[]): number { return r.reduce((x, y) => x | y, a | b); }
export function bit_xor(a: number, b: number, ...r: number[]): number { return r.reduce((x, y) => x ^ y, a ^ b); }
export function bit_not(a: number): number { return ~a; }
export function bit_shift_left(a: number, n: number): number { return a << n; }
export function bit_shift_right(a: number, n: number): number { return a >> n; }

export function distinct_p(x: unknown, ...more: unknown[]): boolean {
  const all = [x, ...more];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) if (equiv(all[i], all[j])) return false;
  }
  return true;
}

export function disj(s: unknown, ...ks: unknown[]): unknown {
  if (s === null || s === undefined) return null;
  let out = s as { disj(k: unknown): unknown };
  for (const k of ks) out = out.disj(k) as typeof out;
  return out;
}

function extremum(better: (a: number, b: number) => boolean) {
  return (k: unknown, x: unknown, ...more: unknown[]): unknown => {
    let best = x;
    let bestK = call(k, x) as number;
    for (const y of more) {
      const yk = call(k, y) as number;
      if (better(yk, bestK)) { best = y; bestK = yk; }
    }
    return best;
  };
}
// Ties go to the later argument, like Clojure.
export const min_key = extremum((a, b) => a <= b);
export const max_key = extremum((a, b) => a >= b);

export function split_at(n: number, coll: unknown): unknown {
  return vector(take(n, coll), drop(n, coll));
}
export function split_with(pred: unknown, coll: unknown): unknown {
  return vector(take_while(pred, coll), drop_while(pred, coll));
}

export function sequence(coll: unknown): unknown {
  return seq(coll as never) ?? list();
}

export function rseq(coll: unknown): unknown {
  const r = reverse(coll);
  return seq(r as never);
}

export function shuffle(coll: unknown): unknown {
  const a = toArray(coll as never);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return vector(...a);
}

export function key(e: unknown): unknown { return nth(e, 0); }
export function val(e: unknown): unknown { return nth(e, 1); }

export function namespace(x: unknown): string | null {
  if (isKeyword(x) || isSymbol(x)) return (x as { ns: string | null }).ns ?? null;
  throw new Error('namespace: unsupported type');
}

// -- JVM-style static helpers reachable as `Character/isUpperCase`, `Integer/parseInt`, ... --

const chr = (c: unknown): string => (typeof c === 'number' ? String.fromCodePoint(c) : (c as string));
export const Character = {
  isUpperCase: (c: unknown): boolean => { const x = chr(c); return x !== x.toLowerCase() && x === x.toUpperCase(); },
  isLowerCase: (c: unknown): boolean => { const x = chr(c); return x !== x.toUpperCase() && x === x.toLowerCase(); },
  isDigit: (c: unknown): boolean => /^\p{Nd}$/u.test(chr(c)),
  isLetter: (c: unknown): boolean => /^\p{L}$/u.test(chr(c)),
  isLetterOrDigit: (c: unknown): boolean => /^[\p{L}\p{Nd}]$/u.test(chr(c)),
  isWhitespace: (c: unknown): boolean => /^\s$/u.test(chr(c)),
  toUpperCase: (c: unknown): string => chr(c).toUpperCase(),
  toLowerCase: (c: unknown): string => chr(c).toLowerCase(),
  getNumericValue: (c: unknown): number => parseInt(chr(c), 36),
};
export const Integer = {
  parseInt: (s: string, radix = 10): number => parseInt(s, radix),
  valueOf: (x: unknown): number => (typeof x === 'string' ? parseInt(x, 10) : Math.trunc(x as number)),
  MAX_VALUE: 2147483647,
  MIN_VALUE: -2147483648,
};
export const Long = { parseLong: (s: string): number => parseInt(s, 10), valueOf: Integer.valueOf, MAX_VALUE: Number.MAX_SAFE_INTEGER, MIN_VALUE: Number.MIN_SAFE_INTEGER };
export const Double = { parseDouble: (s: string): number => parseFloat(s), valueOf: (x: unknown): number => Number(x) };

// -- JVM exception classes for `catch`/`instance?` (matched structurally against JS errors) --

const isError = (x: unknown): boolean => x instanceof Error;
export class Throwable { static [Symbol.hasInstance](x: unknown): boolean { return isError(x); } }
export class Exception { static [Symbol.hasInstance](x: unknown): boolean { return isError(x) && !StackOverflowError[Symbol.hasInstance](x); } }
/** V8/SpiderMonkey/JSC raise RangeError ("Maximum call stack size exceeded" / "too much recursion"). */
export class StackOverflowError {
  static [Symbol.hasInstance](x: unknown): boolean {
    return x instanceof RangeError && /call stack|too much recursion/i.test(x.message);
  }
}

// -- ex-info / ex-message / ex-data --

export function ex_info(msg: string, data: unknown, cause?: unknown): Error {
  const e = new Error(msg, cause === undefined ? undefined : { cause }) as Error & { data?: unknown };
  e.data = data;
  return e;
}
export const ex_message = (e: unknown): unknown => (e instanceof Error ? e.message : null);
export const ex_data = (e: unknown): unknown => (e instanceof Error ? ((e as { data?: unknown }).data ?? null) : null);
