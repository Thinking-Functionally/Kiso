// Structural equality for Clojure values.
//
// Ported from CW's value.zig equivalence logic.
// Key semantic: sequential types compare structurally across types.
// (= '(1 2) [1 2]) → true

import { isList } from './list.js';
import { isVector } from './vector.js';
import { isHashMap } from './hash-map.js';
import { isArrayMap } from './array-map.js';
import { isSortedMap } from './sorted-map.js';
import { isHashSet } from './hash-set.js';
import { isSortedSet } from './sorted-set.js';
import { LazySeq } from './lazy-seq.js';
import { IndexedSeq, seq, first, next } from './seq.js';

const isSequentialColl = (x: unknown): boolean => isVector(x) || isList(x) || x instanceof IndexedSeq || x instanceof LazySeq;
const isMapColl = (x: unknown): boolean => isHashMap(x) || isArrayMap(x) || isSortedMap(x);
const isSetColl = (x: unknown): boolean => isHashSet(x) || isSortedSet(x);

type Each<T> = { forEach(fn: T): void; has(k: unknown): boolean; get?(k: unknown): unknown };

function mapEquiv(a: Each<(k: unknown, v: unknown) => void>, b: Each<(k: unknown, v: unknown) => void>): boolean {
  let na = 0;
  let nb = 0;
  b.forEach(() => { nb++; });
  let same = true;
  a.forEach((k, v) => {
    na++;
    if (same && !(b.has(k) && equiv(v, (b as { get(k: unknown): unknown }).get(k)))) same = false;
  });
  return same && na === nb;
}

function setEquiv(a: Each<(k: unknown) => void>, b: Each<(k: unknown) => void>): boolean {
  let na = 0;
  let nb = 0;
  b.forEach(() => { nb++; });
  let same = true;
  a.forEach((k) => {
    na++;
    if (same && !b.has(k)) same = false;
  });
  return same && na === nb;
}

function seqEquiv(a: unknown, b: unknown): boolean {
  let sa = seq(a as never);
  let sb = seq(b as never);
  while (sa !== null && sb !== null) {
    if (!equiv(first(sa as never), first(sb as never))) return false;
    sa = next(sa as never);
    sb = next(sb as never);
  }
  return sa === null && sb === null;
}

/** Clojure structural equality. */
export function equiv(a: unknown, b: unknown): boolean {
  // null/undefined
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  // Same reference
  if (a === b) return true;

  // Numbers (NaN !== NaN matches Clojure semantics)
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b;
  }

  // Booleans — strict type match
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return false; // different types or a !== b already checked
  }

  // Strings
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }

  // Different primitive types
  if (typeof a !== typeof b) return false;

  // Arrays (sequential structural equality)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!equiv(a[i], b[i])) return false;
    }
    return true;
  }

  if (isSequentialColl(a)) return isSequentialColl(b) && seqEquiv(a, b);
  if (isMapColl(a)) return isMapColl(b) && mapEquiv(a as never, b as never);
  if (isSetColl(a)) return isSetColl(b) && setEquiv(a as never, b as never);

  // Indexed collections with .count and .nth (PersistentVector, etc.)
  const ao = a as Record<string, any>;
  const bo = b as Record<string, any>;
  if (typeof ao.nth === 'function' && typeof ao.count === 'number'
      && typeof bo.nth === 'function' && typeof bo.count === 'number') {
    if (ao.count !== bo.count) return false;
    for (let i = 0; i < ao.count; i++) {
      if (!equiv(ao.nth(i), bo.nth(i))) return false;
    }
    return true;
  }

  // Keywords (interned by name+ns, but different instances may exist in test contexts)
  if (typeof ao._tag === 'symbol' && typeof bo._tag === 'symbol'
      && ao._tag === bo._tag
      && 'name' in ao && 'name' in bo) {
    return ao.name === bo.name && ao.ns === bo.ns;
  }

  return false;
}
