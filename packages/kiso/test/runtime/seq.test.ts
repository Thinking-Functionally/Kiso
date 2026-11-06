// Clojure-visible seq/nth behaviour lives in test/kiso/seq_core_test.cljs; this file keeps JS-representation checks.
import { describe, it, expect } from 'vitest';
import { seq, first, rest, next, toArray, into } from '../../src/runtime/seq.js';
import { list, EMPTY_LIST } from '../../src/runtime/list.js';
import { vector, EMPTY_VECTOR, isVector } from '../../src/runtime/vector.js';
import { hashMap, EMPTY_MAP } from '../../src/runtime/hash-map.js';
import { hashSet, EMPTY_SET } from '../../src/runtime/hash-set.js';
import { keyword } from '../../src/runtime/keyword.js';
import { get, nth } from '../../src/runtime/core.js';

describe('seq on JS array', () => {
  it('seq on empty array returns null', () => {
    expect(seq([])).toBe(null);
  });

  it('seq on array returns seq-able', () => {
    const s = seq([1, 2, 3]);
    expect(first(s)).toBe(1);
    expect(first(next(s))).toBe(2);
    expect(first(next(next(s)))).toBe(3);
    expect(next(next(next(s)))).toBe(null);
  });
});

describe('toArray', () => {
  it('converts null to empty array', () => {
    expect(toArray(null)).toEqual([]);
  });

  it('converts list to array', () => {
    expect(toArray(list(1, 2, 3))).toEqual([1, 2, 3]);
  });

  it('converts vector to array', () => {
    expect(toArray(vector(1, 2, 3))).toEqual([1, 2, 3]);
  });

  it('converts JS array seq', () => {
    expect(toArray(seq([4, 5, 6]))).toEqual([4, 5, 6]);
  });
});

describe('nth (JS interop inputs)', () => {
  it('nth on JS array', () => {
    expect(nth([1, 2, 3], 1)).toBe(2);
    expect(() => nth([1], 5)).toThrow();
    expect(nth([1], 5, -1)).toBe(-1);
  });
});
