/**
 * JS backend output-format tests. Behavioural semantics live in test/kiso/*_test.cljs (clojure.test,
 * run on both backends); only what asserts on printed stdout stays here.
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

describe('JS backend: printing', () => {
  it('println nil prints nil', () => {
    expect(run('(defn -main [] (println nil 1))')).toBe('nil 1');
  });
});
