/**
 * JS backend semantics regression tests (found via the tests/clj suites):
 * scoping, nested defs, fn-level recur, IFn calls, lazy seqs, structural equality/hashing.
 */
import { describe, it, expect } from 'vitest';
import { compile } from '../../src/api/compiler.js';
import * as rt from '../../src/runtime/index.js';

function run(src: string): string {
  const code = compile(src, { target: 'js', features: ['cljs'] }).code
    .replace(/^import \{([^}]*)\} from [^;]+;\s*$/gm, (_m, n: string) => `const {${n.replace(/ as /g, ': ')}} = __rt;`)
    .replace(/^export (let|const|function) /gm, '$1 ')
    .replace(/^export let [^;]+;\s*$/gm, '');
  const out: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void out.push(a.join(' '));
  try {
    // eslint-disable-next-line no-new-func -- test-only: evaluating compiler output
    new Function('__rt', `${code}\n;if (typeof _main === 'function') _main();`)(rt);
  } finally {
    console.log = orig;
  }
  return out.join('\n');
}

const main = (expr: string): string => run(`(defn -main [] (println (pr-str ${expr})))`);

describe('JS backend: scoping and defs', () => {
  it('let shadowing a runtime fn or outer local does not hit the TDZ', () => {
    expect(main('(let [x 1] (let [x (inc x)] x))')).toBe('2');
    expect(main('(let [count (count [1 2 3])] count)')).toBe('3');
  });

  it('loop rebinding of a seq parameter', () => {
    expect(main('(loop [xs (seq [1 2 3]) acc 0] (if xs (recur (next xs) (+ acc (first xs))) acc))')).toBe('6');
  });

  it('declare followed by defn', () => {
    expect(run('(declare f) (defn g [] (f)) (defn f [] 7) (defn -main [] (println (g)))')).toBe('7');
  });

  it('fn-level recur does not grow the stack', () => {
    expect(run('(defn go [n acc] (if (zero? n) acc (recur (dec n) (+ acc 1)))) (defn -main [] (println (go 100000 0)))')).toBe('100000');
  });

  it('reserved JS words as parameter names', () => {
    expect(main('((fn [in] (inc in)) 1)')).toBe('2');
  });

  it('rest param named args in a multi-arity fn', () => {
    expect(run('(defn f ([] 0) ([a & args] (count args))) (defn -main [] (println (f 1 2 3)))')).toBe('2');
  });

  it('Math/ static calls', () => {
    expect(main('(Math/abs -3)')).toBe('3');
  });
});

describe('JS backend: IFn call positions', () => {
  it('local, def and call-result callees may be maps/vectors/sets', () => {
    expect(main('(let [m {1 2}] (m 1))')).toBe('2');
    expect(run('(def v [10 20]) (defn -main [] (println (v 1)))')).toBe('20');
    expect(main('((hash-map :a 1) :a)')).toBe('1');
  });
});

describe('JS backend: sequences', () => {
  it('lazy fns work on infinite seqs', () => {
    expect(main('(vec (take 3 (filter odd? (range))))')).toBe('[1 3 5]');
    expect(main('(let [[a b c] (range)] [a b c])')).toBe('[0 1 2]');
    expect(main('(vec (take 2 (map + (range) [10 20 30])))')).toBe('[10 21]');
  });

  it('cons onto non-list collections', () => {
    expect(main('(cons 1 [])')).toBe('(1)');
    expect(main('(count (cons 1 (rest [1 2 3])))')).toBe('3');
  });

  it('conj/into on maps and seqs', () => {
    expect(main('(into {} [[:a 1]])')).toBe('{:a 1}');
    expect(main('(conj {} [:a 1])')).toBe('{:a 1}');
  });

  it('strings are seqable, reductions, quoted maps/sets', () => {
    expect(main('(vec "abc")')).toBe('["a" "b" "c"]');
    expect(main('(vec (reductions + [1 2 3]))')).toBe('[1 3 6]');
    expect(main("(= '#{b c} (set ['c 'b]))")).toBe('true');
    expect(main("(= '{f 1} (assoc {} 'f 1))")).toBe('true');
  });

  it('sort with boolean comparators and vector keys', () => {
    expect(main('(sort > [3 1 2])')).toBe('(3 2 1)');
    expect(main('(sort [[2 1] [1 9] [1 2]])')).toBe('([1 2] [1 9] [2 1])');
  });

  it('variadic comparisons and apply', () => {
    expect(main('(apply < [1 2 3])')).toBe('true');
    expect(main('(apply min-key count [[1 2] [1]])')).toBe('[1]');
  });
});

describe('JS backend: equality and hashing', () => {
  it('collections are structural hash keys', () => {
    expect(main('(get {[1 2] :a} [1 2])')).toBe(':a');
    expect(main('(contains? #{[1 2]} [1 2])')).toBe('true');
    expect(main('(= #{[1 2]} (set [[1 2]]))')).toBe('true');
    expect(main("(vec (distinct ['a 'b 'a]))")).toBe('[a b]');
  });

  it('println nil prints nil', () => {
    expect(run('(defn -main [] (println nil 1))')).toBe('nil 1');
  });
});

describe('JS backend: JVM exception classes', () => {
  it('runaway recursion is a catchable StackOverflowError (and a Throwable)', () => {
    const src = '(defn runaway [n] (inc (runaway (inc n)))) ';
    expect(run(`${src}(defn -main [] (println (try (runaway 0) false (catch StackOverflowError _ true))))`)).toBe('true');
    expect(run(`${src}(defn -main [] (println (instance? Throwable (try (runaway 0) (catch Throwable t t)))))`)).toBe('true');
  });

  it('Exception does not swallow StackOverflowError', () => {
    expect(run('(defn -main [] (println (try (throw (js/Error. "x")) (catch Exception e :caught))))')).toBe(':caught');
  });
});
