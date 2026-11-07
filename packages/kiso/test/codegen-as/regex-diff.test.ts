// Regex differential: the in-wasm engine must agree with JS RegExp on the supported subset.
import { describe, expect, it } from 'vitest';
import { both } from './helpers/differential.js';
import { runKisoAs } from './helpers/build-wasm.js';
import { runJs } from '../clj-suite/harness.js';

const q = (s: string) => JSON.stringify(s);
const CASES: Array<[string, string]> = [
  ['abc', 'xxabcxx'], ['a.c', 'a\nc abc'], ['\\d+', 'a12b345'], ['\\w+', '  foo_bar9 '], ['\\s+', 'a \t\nb'],
  ['[a-c]+', 'xxabcabcxx'], ['[^a-c]+', 'abcxyzabc'], ['[\\d.]+', 'v1.25.3'], ['[a\\-z]+', 'a-z-a'],
  ['^abc', 'abcabc'], ['abc$', 'abcabc'], ['\\bfoo\\b', 'a foo b foobar'], ['\\Boo', 'foo boo'],
  ['(a)(b)?', 'ac ab'], ['(?:ab)+', 'ababab'], ['a|ab|abc', 'abcd'], ['(a|ab)(c|bcd)', 'abcd'],
  ['a*', 'aaab'], ['a+?', 'aaa'], ['a{2}', 'aaaa'], ['a{2,3}', 'aaaaa'], ['a{2,}', 'aaaaa'], ['a??b', 'ab'],
  ['(\\d+)-(\\d+)', '10-20 30-40'], ['(\\w+)@(\\w+)\\.com', 'joe@site.com bob@x.com'],
  ['x*', 'abc'], ['', 'abc'], ['(a*)*', 'aab'], ['(a*)+', 'b'], ['[A-Z][a-z]+', 'Hello World Foo'],
  ['é+', 'caféé'], ['\\.', 'a.b.c'], ['[.]', 'a.b'], ['\\$\\d+', 'cost $42'], ['(.)(.)', 'abcd'],
  ['[\\w.]+@[\\w.]+', 'mail me: a.b@c.org now'], ['\\D+', 'ab12cd'], ['\\S+', '  hi there '], ['\\W+', 'a, b; c'],
];

describe('regex: AS engine agrees with JS RegExp', () => {
  it('re-find, re-matches, re-seq', async () => {
    const lines = CASES.flatMap(([p, s], i) => [
      `(println ${i} "find" (pr-str (re-find #${q(p)} ${q(s)})))`,
      `(println ${i} "matches" (pr-str (re-matches #${q(p)} ${q(s)})))`,
      `(println ${i} "seq" (pr-str (re-seq #${q(p)} ${q(s)})))`,
    ]);
    const r = await both(`(ns t)\n(defn -main []\n${lines.join('\n')})\n`);
    expect(r.as.split('\n')).toEqual(r.js.split('\n'));
  });

  it('replace, replace-first, split', async () => {
    const lines = CASES.flatMap(([p, s], i) => [
      `(println ${i} "replace" (pr-str (str/replace ${q(s)} #${q(p)} "<$0>")))`,
      `(println ${i} "first" (pr-str (str/replace-first ${q(s)} #${q(p)} "_")))`,
      `(println ${i} "split" (pr-str (str/split ${q(s)} #${q(p)})))`,
    ]);
    const src = `(ns t (:require [clojure.string :as str]))\n(defn -main []\n${lines.join('\n')})\n`;
    const as = await runKisoAs(src);
    as.exports.main!();
    const js = runJs(src + '(-main)\n', () => null);
    const a = as.output.trim().split('\n');
    const j = js.trim().split('\n');
    expect(a.map((l, i) => (l === j[i] ? '' : `AS ${l} | JS ${j[i]}`)).filter(Boolean)).toEqual([]);
  });
});
