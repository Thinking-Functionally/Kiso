import { describe, it, expect } from 'vitest';
import { assoc, get } from '../../src/runtime/core.js';
import { hashMap } from '../../src/runtime/hash-map.js';
import { vector } from '../../src/runtime/vector.js';

describe('assoc', () => {
  it('applies every key/value pair', () => {
    const m = assoc(hashMap(), 'a', 1, 'b', 2, 'c', '') as ReturnType<typeof hashMap>;
    expect(get(m, 'a')).toBe(1);
    expect(get(m, 'b')).toBe(2);
    expect(get(m, 'c')).toBe('');
  });

  it('works on vectors with several index pairs', () => {
    const v = assoc(vector(1, 2, 3), 0, 9, 2, 7) as { nth(i: number): unknown };
    expect([v.nth(0), v.nth(1), v.nth(2)]).toEqual([9, 2, 7]);
  });

  it('rejects a dangling key', () => {
    expect(() => assoc(hashMap(), 'a', 1, 'b')).toThrow(/even number/);
  });
});
