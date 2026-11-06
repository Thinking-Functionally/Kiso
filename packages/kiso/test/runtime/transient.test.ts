import { describe, it, expect } from 'vitest';
import { vector } from '../../src/runtime/vector.js';
import { transient, persistent_m, conj_m } from '../../src/runtime/transient.js';

// Behaviour lives in test/kiso/transient_test.cljs; AS has no exceptions, so error cases stay here.
describe('transient error handling', () => {
  it('throws on unsupported type', () => {
    expect(() => transient('string' as any)).toThrow();
  });
  it('throws when using transient after persistent!', () => {
    const t = transient(vector(1, 2, 3));
    persistent_m(t);
    expect(() => conj_m(t, 4)).toThrow();
  });
});
