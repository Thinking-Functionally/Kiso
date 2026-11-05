import { describe, it, expect } from 'vitest';
import { compile } from '../../src/api/compiler.js';
import { both } from './helpers/differential.js';

const asOf = (src: string) => compile(src, { target: 'as' }).code;

describe('numeric specialization (D19)', () => {
  it('emits a native f64 twin for pure numeric fns', () => {
    const code = asOf('(defn ^:export fib [n] (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2)))))');
    expect(code).toContain('function nf_0(l_n: f64): f64');
    expect(code).toContain('return nf_0(a0);');
  });
  it('does not specialize fns that touch non-numeric values', () => {
    expect(asOf('(defn f [x] (println x))')).not.toContain('nf_');
    expect(asOf('(defn g [x] (if x 1 2))')).not.toContain('nf_');
  });
  it('matches JS for numeric loops and the boxed fallback', async () => {
    const { js, as } = await both(
      '(defn sum [n] (loop [i 0 acc 0] (if (< i n) (recur (inc i) (+ acc i)) acc)))\n(defn id [x] (if (< x 0) (- x) x))\n(println (sum 100) (id -3) (id 4) (mod -7 3) (rem -7 3))',
    );
    expect(as).toBe(js);
    expect(as).toBe('4950 3 4 2 -1\n');
  }, 60_000);
  it('falls back to the generic body (which aborts) for non-number args', async () => {
    const { runKisoAs } = await import('./helpers/build-wasm.js');
    await expect(runKisoAs('(defn id [x] (if (< x 0) (- x) x))\n(println (id "a"))')).rejects.toThrow(/not a number/);
  }, 60_000);
});
