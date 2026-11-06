import { describe, it, expect } from 'vitest';
import { runKisoAs } from './helpers/build-wasm.js';

async function out(src: string): Promise<string> {
  const r = await runKisoAs(src);
  r.exports.main!();
  return r.output.replace(/\n$/, '');
}

const cases: Record<string, [string, string]> = {
  iterate: ['(defn -main [] (println (reduce + 0 (take 5 (iterate inc 1)))))', '15'],
  infRange: ['(defn -main [] (println (first (drop 100 (range)))))', '100'],
  repeatCycle: ['(defn -main [] (println (count (take 7 (cycle [1 2 3]))) (reduce + 0 (take 3 (repeat 4)))))', '7 12'],
  lazyFibs: ['(defn fibs [a b] (lazy-seq (cons a (fibs b (+ a b)))))\n(defn -main [] (println (reduce + 0 (take 10 (fibs 0 1)))))', '88'],
  mapFilterInf: ['(defn -main [] (println (reduce + 0 (take 3 (filter even? (map inc (range)))))))', '12'],
  sideEffectOnce: ['(defn -main [] (let [s (map (fn [x] (println "x" x) x) [1 2])] (doall s) (doall s) (println (count s))))', 'x 1\nx 2\n2'],
  restNext: ['(defn -main [] (println (first (rest (map inc [1 2 3]))) (nil? (next (map inc [1])))))', '3 true'],
  eqLazy: ['(defn -main [] (println (= [2 3] (map inc [1 2])) (= (map inc [1]) (list 2))))', 'true true'],
  takeWhile: ['(defn -main [] (println (count (take-while #(< % 5) (range))) (first (drop-while #(< % 5) (range)))))', '5 5'],
  mapcat: ['(defn -main [] (println (count (mapcat (fn [x] [x x]) [1 2 3]))))', '6'],
  someInf: ['(defn -main [] (println (some #(when (> % 3) %) (range))))', '4'],
  sort: ['(defn -main [] (println (first (sort [3 1 2])) (first (sort > [3 1 2])) (first (sort-by :a [{:a 2} {:a 1}]))))', '1 3 {:a 1}'],
  sortStable: ['(defn -main [] (println (map first (sort-by second [[:a 1] [:b 0] [:c 1]]))))', '(:b :a :c)'],
  compare: ['(defn -main [] (println (compare 1 2) (compare "b" "a")))', '-1 1'],
  forNested: ['(defn -main [] (println (count (for [x [1 2 3] y [1 2 3] :when (< x y)] [x y]))))', '3'],
  forLet: ['(defn -main [] (println (reduce + 0 (for [x (range 5) :let [y (* x x)] :when (even? x)] y))))', '20'],
  forWhile: ['(defn -main [] (println (count (for [x (range) :while (< x 4)] x))))', '4'],
  forPrint: ['(defn -main [] (println (for [x [1 2]] (* x 2))))', '(2 4)'],
};

describe('AS lazy seqs, sort, for', () => {
  for (const [name, [src, want]] of Object.entries(cases)) {
    it(name, async () => { expect(await out(src)).toBe(want); }, 60_000);
  }
  it('try is rejected with a clear message', async () => {
    await expect(runKisoAs('(defn -main [] (try 1 (catch js/Error e 2)))')).rejects.toThrow(/catchable exceptions/);
  }, 60_000);
});
