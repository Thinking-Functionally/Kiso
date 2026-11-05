import { describe, it, expect } from 'vitest';
import { both } from './helpers/differential.js';
import { runKisoAs } from './helpers/build-wasm.js';

// Scalar-printing programs run on both backends.
const programs: Record<string, string> = {
  restParams: '(defn f [a & xs] (+ a (count xs)))\n(println (f 1) (f 1 2 3) (f 10 1 1 1 1))',
  restSum: '(defn sum [& xs] (reduce + 0 xs))\n(println (sum) (sum 1 2 3 4))',
  restSelf: '(defn g [x & more] (if (seq more) (+ x (apply g more)) x))\n(println (g 1 2 3 4))',
  applyPlain: '(println (apply + [1 2 3]) (apply max [3 9 2]))',
  mapFilter: '(println (reduce + 0 (map inc [1 2 3])) (reduce + 0 (filter odd? [1 2 3 4 5])) (reduce + 0 (remove odd? [1 2 3 4 5])))',
  rangeTake: '(println (count (range 5)) (reduce + 0 (range 1 5)) (reduce + 0 (range 0 10 3)) (count (take 2 [1 2 3])) (count (drop 2 [1 2 3])))',
  someEvery: '(println (some even? [1 3 4]) (some even? [1 3]) (every? odd? [1 3]) (every? odd? [1 2]))',
  dotimes: '(dotimes [i 5] (println i))',
  doseq: '(doseq [x [1 2 3]] (println x))',
  threadList: '(println (reduce + 0 (->> (range 10) (filter even?) (map inc))))',
  conjNil: '(println (count (conj nil 1 2)) (first (conj nil 1 2)))',
  setCall: '(println (#{1 2} 1) (get #{1 2} 3 :no))',
  intoVec: '(println (count (into [] (map inc [1 2 3]))) (count (into #{} [1 1 2])))',
  reverseConcat: '(println (first (reverse [1 2 3])) (count (concat [1] [2 3] [4])))',
  quotedList: "(println (count '(1 2 3)) (first '(4 5)))",
};

describe('seqs/sets/rest: JS backend vs AS/wasm', () => {
  for (const [name, src] of Object.entries(programs)) {
    it(name, async () => {
      const { js, as } = await both(src);
      expect(as).toBe(js);
      expect(as.length).toBeGreaterThan(0);
    }, 60_000);
  }
});

describe('seqs/sets: AS-only (the JS backend lacks or miscomputes these)', () => {
  const run = async (src: string) => (await runKisoAs(src)).output;
  it('rest/next', async () => {
    expect(await run('(println (first (rest [1 2 3])) (count (rest [1 2 3])) (count (rest [])) (nil? (next [1])) (first (next [1 2])))')).toBe('2 2 0 true 2\n');
  });
  it('map over two collections', async () => {
    expect(await run('(println (reduce + 0 (map + [1 2 3] [10 20 30])))')).toBe('66\n');
  });
  it('set ops', async () => {
    expect(await run('(println (count #{1 2 3}) (contains? #{1 2} 2) (contains? #{1 2} 5) (count (conj #{1} 1)) (count (conj #{1} 2)) (count (disj #{1 2} 1)))')).toBe('3 true false 1 2 1\n');
  });
  it('apply with leading args', async () => {
    expect(await run('(println (apply + 1 2 [3 4]))')).toBe('10\n');
  });
  it('cons', async () => {
    expect(await run('(println (first (cons 0 [1 2])) (count (cons 0 nil)))')).toBe('0 1\n');
  });
  it('ex-info accessors', async () => {
    expect(await run('(println (ex-message (ex-info "boom" {:a 1})) (:a (ex-data (ex-info "boom" {:a 1}))))')).toBe('boom 1\n');
  });
});

describe('seqs/sets: AS-only printing and semantics', () => {
  const run = async (src: string) => (await runKisoAs(src)).output;

  it('prints sets, lists and seq results Clojure-style', async () => {
    expect(await run('(prn #{1 2} (list 1 2) (map inc [1 2]) (rest [1 2 3]) (range 3) (seq []))')).toBe('#{1 2} (1 2) (2 3) (2 3) (0 1 2) nil\n');
  });
  it('conj on a list prepends, on a vector appends', async () => {
    expect(await run('(prn (conj (list 1 2) 0) (conj [1 2] 3) (conj nil 1))')).toBe('(0 1 2) [1 2 3] (1)\n');
  });
  it('set equality ignores order', async () => {
    expect(await run('(println (= #{1 2} #{2 1}) (= #{1} #{2}))')).toBe('true false\n');
  });
  it('rest params are nil when empty and a list otherwise', async () => {
    expect(await run('(defn f [& xs] xs)\n(prn (f) (f 1 2))')).toBe('nil (1 2)\n');
  });
  it('map works over maps and sets via seq', async () => {
    expect(await run('(prn (map first {:a 1 :b 2}) (count (seq #{1 2 3})))')).toBe('(:a :b) 3\n');
  });
  it('ex-info carries message and data', async () => {
    expect(await run('(prn (ex-message (ex-info "x" {:k 1})) (ex-data (ex-info "x" {:k 1})))')).toBe('"x" {:k 1}\n');
  });
  it('still rejects try with a clear message', async () => {
    await expect(runKisoAs('(try 1 (catch js/Error e 2))')).rejects.toThrow(/try/);
  });
});
