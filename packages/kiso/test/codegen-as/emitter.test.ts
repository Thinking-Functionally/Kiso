import { describe, it, expect } from 'vitest';
import { compile } from '../../src/api/compiler.js';
import { runKisoAs } from './helpers/build-wasm.js';

const asOf = (src: string) => compile(src, { target: 'as' }).code;

describe('emitter-as: source shape', () => {
  it('emits a Fn class per function and a global per def', () => {
    const code = asOf('(defn inc2 [x] (+ x 2))');
    expect(code).toContain('class Fn_0 extends Fn');
    expect(code).toContain('call1(l_x: Value): Value');
    expect(code).toContain('let g_inc2: Value = NIL;');
  });
  it('exports ^:export fns through the f64 ABI', () => {
    expect(asOf('(defn ^:export sq [x] (* x x))')).toContain('export function sq(a0: f64): f64');
  });
  it('rejects sets with a clear message', () => {
    expect(() => asOf('(def v #{1 2})')).toThrow(/set literal/);
  });
});

describe('emitter-as: run in wasm', () => {
  it('runs println at start', async () => {
    const r = await runKisoAs('(println "hello" 1 2.5 :k nil true)');
    expect(r.output).toBe('hello 1 2.5 :k  true\n');
  }, 60_000);

  it('fib via export', async () => {
    const r = await runKisoAs('(defn ^:export fib [n] (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2)))))');
    expect(r.exports.fib!(20)).toBe(6765);
  }, 60_000);

  it('-main with loop/recur and closures', async () => {
    const r = await runKisoAs(
      '(defn adder [n] (fn [x] (+ x n)))\n(defn -main [] (let [f (adder 10)] (loop [i 0] (when (< i 3) (println (f i)) (recur (inc i))))))',
    );
    r.exports.main!();
    expect(r.output).toBe('10\n11\n12\n');
  }, 60_000);
});
