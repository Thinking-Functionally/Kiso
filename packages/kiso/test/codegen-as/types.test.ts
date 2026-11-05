import { describe, it, expect } from 'vitest';
import { runKisoAs } from './helpers/build-wasm.js';

const SHAPES = `(defprotocol Shape (area [this]) (scale [this k]))
(defrecord Circle [r] Shape (area [this] (* r r 3)) (scale [this k] (->Circle (* r k))))
(deftype Rect [w h] Shape (area [this] (* w h)) (scale [this k] (Rect. (* w k) (* h k))))
`;

// The JS backend miscompiles record field access, so expected output is stated per Clojure semantics.
const programs: Record<string, [string, string]> = {
  recordMethods: [SHAPES + '(println (area (Circle. 2)) (area (->Circle 3)) (area (scale (Circle. 1) 4)))', '12 27 48\n'],
  deftypeMethods: [SHAPES + '(println (area (Rect. 2 5)) (area (scale (Rect. 2 5) 2)))', '10 40\n'],
  fieldsInClosure: ['(defprotocol P (go [this])) (defrecord R [n] P (go [this] (reduce + 0 (map (fn [x] (+ x n)) [1 2 3]))))\n(println (go (R. 10)))', '36\n'],
  recursionViaProtocol: ['(defprotocol Sz (sz [t])) (defrecord Leaf [] Sz (sz [_] 1)) (defrecord Node [l r] Sz (sz [_] (+ (sz l) (sz r))))\n(println (sz (Node. (Node. (Leaf.) (Leaf.)) (Leaf.))))', '3\n'],
  extendBuiltin: ['(defprotocol Dbl (dbl [x])) (extend-type Number Dbl (dbl [n] (* n 2))) (extend-type nil Dbl (dbl [_] 0))\n(println (dbl 21) (dbl nil))', '42 0\n'],
  multiArity: ['(defprotocol A (f [this] [this x])) (defrecord T [v] A (f [this] v) (f [this x] (+ v x)))\n(println (f (T. 1)) (f (T. 1) 5))', '1 6\n'],
  keywordLookup: ['(defrecord P [x y])\n(println (:x (P. 1 2)) (:y (P. 1 2)) (get (P. 1 2) :x) (:z (P. 1 2) 9))', '1 2 1 9\n'],
  assocRecord: ['(defrecord P [x y])\n(println (:x (assoc (P. 1 2) :x 10)) (:y (assoc (P. 1 2) :x 10)))', '10 2\n'],
  mapCtor: ['(defrecord P [x y])\n(println (:y (map->P {:x 1 :y 7})))', '7\n'],
  ctorAsValue: ['(defrecord P [x])\n(println (reduce + 0 (map :x (map ->P [1 2 3]))))', '6\n'],
  reifyBasic: ['(defprotocol G (hi [this x])) (def o (reify G (hi [_ x] (+ x 1))))\n(println (hi o 41))', '42\n'],
  reifyCapture: ['(defprotocol G (hi [this])) (defn mk [n] (reify G (hi [_] (* n 2))))\n(println (hi (mk 21)))', '42\n'],
  extendUser: ['(defprotocol G (hi [this])) (defrecord P [x]) (extend-type P G (hi [p] 99))\n(println (hi (P. 1)))', '99\n'],
};

describe('deftype/defrecord/protocols on AS/wasm', () => {
  for (const [name, [src, out]] of Object.entries(programs)) {
    it(name, async () => {
      expect((await runKisoAs(src)).output).toBe(out);
    }, 60_000);
  }
});

describe('records: AS-only printing and equality', () => {
  const run = async (src: string) => (await runKisoAs(src)).output;
  it('prints and compares records structurally', async () => {
    expect(await run('(defrecord P [x y])\n(prn (P. 1 "a") (= (P. 1 2) (P. 1 2)) (= (P. 1 2) (P. 1 3)) (count (P. 1 2)) (contains? (P. 1 2) :x))')).toBe('#P{:x 1, :y "a"} true false 2 true\n');
  });
  it('records work as map keys by value', async () => {
    expect(await run('(defrecord P [x])\n(println (get {(P. 1) 5} (P. 1)))')).toBe('5\n');
  });
  it('default implementation applies to everything else', async () => {
    expect(await run('(defprotocol D (d [x])) (extend-type Number D (d [n] 1)) (extend-type default D (d [_] 0))\n(println (d 5) (d "s") (d nil))')).toBe('1 0 0\n');
  });
  it('calling an unimplemented method aborts with a clear message', async () => {
    await expect(run('(defprotocol D (d [x])) (extend-type Number D (d [n] 1))\n(d "s")')).rejects.toThrow(/No implementation of method d of protocol D/);
  });
  it('rejects protocols not defined in the module and unknown extend targets', async () => {
    await expect(run('(defrecord P [x] Object (toString [_] "p"))')).rejects.toThrow(/defprotocol/);
    await expect(run('(defprotocol D (d [x])) (extend-type Foo D (d [x] 1))')).rejects.toThrow(/unknown type/);
  });
  it('constructor arity is checked at compile time', async () => {
    await expect(run('(defrecord P [x y]) (P. 1)')).rejects.toThrow(/expects 2/);
  });
});
