import { describe, it, expect } from 'vitest';
import { reduced, Reduced, ensure_reduced, map, filter, take } from '../../src/runtime/index.js';

// Behaviour lives in test/kiso/transducer_test.cljs; these check the JS representation only.
describe('Reduced representation', () => {
  it('reduced wraps a value in a Reduced instance', () => {
    const r = reduced(42);
    expect(r).toBeInstanceOf(Reduced);
    expect(r.value).toBe(42);
  });
  it('ensure-reduced passes a Reduced through by identity', () => {
    const r = reduced(10);
    expect(ensure_reduced(r)).toBe(r);
  });
});

describe('1-arity transducers are plain functions', () => {
  it('map/filter/take', () => {
    expect(typeof map((x: number) => x)).toBe('function');
    expect(typeof filter((x: number) => x > 1)).toBe('function');
    expect(typeof take(2)).toBe('function');
  });
});
