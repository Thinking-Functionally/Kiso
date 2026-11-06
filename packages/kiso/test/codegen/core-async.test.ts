/**
 * core.async on the JS backend: go blocks are CPS-transformed (src/analyzer/go.ts)
 * onto the channel runtime (src/runtime/async.ts).
 */
import { describe, it, expect } from 'vitest';
import { compile } from '../../src/api/compiler.js';
import * as rt from '../../src/runtime/index.js';
import { ASYNC_CASES, ASYNC_NS } from './core-async-cases.js';

async function run(src: string): Promise<string> {
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
    await new Promise((r) => setTimeout(r, 30));
  } finally {
    console.log = orig;
  }
  return out.join('\n');
}

const prog = (body: string) => run(`${ASYNC_NS}(defn -main [] ${body})`);

describe('core.async (JS)', () => {
  for (const [name, body, expected] of ASYNC_CASES) {
    it(name, async () => {
      expect(await prog(body)).toBe(expected);
    });
  }
});
