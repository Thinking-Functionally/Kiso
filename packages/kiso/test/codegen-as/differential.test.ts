import { describe, it, expect } from 'vitest';
import { both } from './helpers/differential.js';

const programs: Record<string, string> = {
  arithmetic: '(println (+ 1 2 3) (- 10 4) (* 2 3 4) (/ 9 2) (- 5) (mod -7 3) (rem -7 3) (inc 1) (dec 1))',
  comparisons: '(println (< 1 2) (> 1 2) (<= 2 2) (>= 1 2) (= 1 1) (= "a" "a") (= :k :k) (= 1 2) (not true) (zero? 0))',
  truthiness: '(println (if nil 1 2) (if false 1 2) (if 0 1 2) (if "" 1 2))',
  let: '(println (let [a 1 b (+ a 1)] (* a b)))',
  fib: '(defn fib [n] (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2)))))\n(println (fib 15))',
  loop: '(defn -main [] (loop [i 0 acc 0] (if (< i 5) (recur (inc i) (+ acc i)) (println acc))))',
  closure: '(defn adder [n] (fn [x] (+ x n)))\n(println ((adder 3) 4))',
  multiArity: '(defn f ([] 0) ([a] a) ([a b] (+ a b)))\n(println (f) (f 1) (f 1 2))',
  letfn: '(println (letfn [(ev? [n] (if (zero? n) true (od? (dec n)))) (od? [n] (if (zero? n) false (ev? (dec n))))] (ev? 10)))',
  evalOrder: '(defn t [x] (println "t" x) x)\n(println (+ (t 1) (t 2)))',
  when: '(defn -main [] (when (> 2 1) (println "yes")) (when-not (> 2 1) (println "no")))',
  cond: '(defn k [n] (cond (< n 0) "neg" (zero? n) "zero" :else "pos"))\n(println (k -1) (k 0) (k 5))',
};

describe('differential: JS backend vs AS/wasm', () => {
  for (const [name, src] of Object.entries(programs)) {
    it(name, async () => {
      const { js, as } = await both(src);
      expect(as).toBe(js);
      expect(as.length).toBeGreaterThan(0);
    }, 60_000);
  }
});
