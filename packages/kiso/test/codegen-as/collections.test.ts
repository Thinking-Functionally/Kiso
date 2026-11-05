import { describe, it, expect } from 'vitest';
import { both } from './helpers/differential.js';
import { runKisoAs } from './helpers/build-wasm.js';

// Programs print scalars so both backends can be compared directly.
const programs: Record<string, string> = {
  vectorBasics:
    '(println (count [1 2 3]) (nth [5 6] 0) (get [5 6] 1) (first [7 8]) (second [7 8]) (last [7 8]) (peek [1 2]) (count (conj [1] 2 3)) (count (pop [1 2])) (nth [1] 5 :none) (empty? []) (count nil))',
  mapBasics:
    '(println (get {:a 1} :a) (get {:a 1} :z 9) (count (assoc {:a 1} :b 2)) (count (dissoc {:a 1 :b 2} :a)) (contains? {:a 1} :a) (contains? {:a 1} :b) (:a {:a 3}) ({:a 4} :a) (:z {:a 1} 7) ([9 8] 1) (get nil :a))',
  equality: '(println (= [1 2] [1 2]) (= [1 2] [1 3]) (= [1 [2]] [1 [2]]) (= "a" "a") (= :a :a) (= nil nil))',
  persistence: '(def v [1 2]) (def a (conj v 3)) (def b (conj v 4))\n(println (count v) (nth a 2) (nth b 2) (count a))',
  mapPersistence:
    '(def m {:a 1}) (def m2 (assoc m :b 2)) (def m3 (assoc m :c 3))\n(println (count m) (get m2 :b) (get m2 :c) (get m3 :c) (get m3 :b) (get (assoc m :a 9) :a) (get m :a))',
  nested: '(println (get-in {:a {:b [1 2 3]}} [:a :b 1]) (get-in {:a 1} [:x :y] :d) (get (update {:a 1} :a inc) :a) (get (update {:a 1} :a + 10) :a))',
  reduceFns: '(println (reduce + 0 [1 2 3 4]) (reduce + [1 2 3]) (count (reduce (fn [acc x] (conj acc (* x x))) [] [1 2 3])) (reduce max 0 [3 9 2]))',
  str: '(println (str "a" 1 :k nil) (str) (str "x" (str "y" "z")))',
  buildBig:
    '(defn build [n] (loop [i 0 v []] (if (< i n) (recur (inc i) (conj v i)) v)))\n(def v (build 1000))\n(println (count v) (nth v 999) (reduce + 0 v))',
  bigMap:
    '(defn build [n] (loop [i 0 m {}] (if (< i n) (recur (inc i) (assoc m i (* i 2))) m)))\n(def m (build 500))\n(println (count m) (get m 499) (get m 0) (get m 1000) (contains? m 250))',
  keyedLookups: '(println (get {:a/b 1 :c 2} :a/b) (get {"s" 1} "s"))',
  coreFnValues: '(defn app [f x y] (f x y))\n(println (app + 1 2) (app * 3 4) (app max 3 9) (count (reduce conj [] [1 2])))',
  fnInColl: '(def fs [inc dec])\n(println ((first fs) 5) ((second fs) 5))',
};

describe('collections: JS backend vs AS/wasm', () => {
  for (const [name, src] of Object.entries(programs)) {
    it(name, async () => {
      const { js, as } = await both(src);
      expect(as).toBe(js);
      expect(as.length).toBeGreaterThan(0);
    }, 60_000);
  }
});

describe('collections: AS-only semantics (JS backend returns nil for these)', () => {
  it('looks up structural keys', async () => {
    const r = await runKisoAs('(println (get {"s" 1 [1 2] 3} [1 2]) (get {{:a 1} 5} {:a 1}))');
    expect(r.output).toBe('3 5\n');
  }, 60_000);
});

describe('collections: AS printing (JS println cannot print collections)', () => {
  it('println and prn print collections Clojure-style', async () => {
    const r = await runKisoAs('(println [1 "a" :k nil] {:a 1 :b [2]} (keys {:a 1 :b 2}))\n(prn ["a" {:k "v"}])');
    expect(r.output).toBe('[1 a :k nil] {:a 1, :b [2]} (:a :b)\n["a" {:k "v"}]\n');
  }, 60_000);
});
