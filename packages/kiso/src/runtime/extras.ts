// Additional clojure.core functions (kept apart from core.ts); exported through the runtime barrel.

import { seq, toArray } from './seq.js';
import { vector, isVector } from './vector.js';
import { isList, list } from './list.js';
import { hashMap } from './hash-map.js';
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

export function int(x: number): number { return Math.trunc(x); }
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
