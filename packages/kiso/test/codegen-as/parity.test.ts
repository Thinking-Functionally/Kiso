import { it, expect } from 'vitest';
import { runKisoAs } from './helpers/build-wasm.js';

const run = async (src: string) => {
  const r = await runKisoAs(src);
  r.exports.main!();
  return r.output.trim();
};

it('atoms and swap!', async () => {
  expect(await run('(defn -main [] (let [a (atom 1)] (swap! a + 2 3) (println @a)))')).toBe('6');
});
it('empty list is a real list', async () => {
  expect(await run("(defn -main [] (println (= '() (reduce conj () [])) (list? ())))")).toBe('true true');
});
it('prelude fns and user defmacro', async () => {
  expect(await run('(defmacro twice [x] `(* 2 ~x)) (defn -main [] (println (twice 4) (pr-str (distinct [1 1 2])) (pr-str (min-key count [1 2] [3]))))')).toBe('8 [1 2] [3]');
});
it('clojure.string alias', async () => {
  expect(await run('(ns t (:require [clojure.string :as s])) (defn -main [] (println (s/upper-case "ab")))')).toBe('AB');
});
it('variadic comparisons, direct and first-class', async () => {
  expect(await run('(defn -main [] (println (< 1 2 3 4) (< 1 3 2 4) (>= 5 5 4 4) (<= 1) (apply < [1 2 3 4 5]) (apply >= [3 3 2]) (every? true? (map < [1 2] [2 3]))))')).toBe('true false true true true true true');
});
