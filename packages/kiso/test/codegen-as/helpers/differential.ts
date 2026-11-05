// Differential harness: run the same Kiso source through the JS backend and the AS/wasm
// backend and return what each printed, so tests can assert they agree.
import { vi } from 'vitest';
import { compile } from '../../../src/api/compiler.js';
import * as rt from '../../../src/runtime/index.js';
import { runKisoAs } from './build-wasm.js';

export async function runJs(src: string, call: string[] = []): Promise<{ output: string; exports: Record<string, (...a: number[]) => unknown> }> {
  const code = compile(src, { target: 'js' }).code
    .replace(/^import \{([^}]*)\} from [^;]+;\s*$/gm, (_m, names: string) => `const {${names}} = __rt;`)
    .replace(/^export (let|const|function) /gm, '$1 ');
  const names = [...code.matchAll(/^(?:let|const|function) ([A-Za-z0-9_$]+)/gm)].map((m) => m[1]);
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
  try {
    // eslint-disable-next-line no-new-func -- test-only: evaluating compiler output
    const exp = new Function('__rt', `${code}\nreturn { ${names.join(', ')} };`)(rt) as Record<string, (...a: number[]) => unknown>;
    for (const c of call) exp[c]!();
    return { output: lines.length ? lines.join('\n') + '\n' : '', exports: exp };
  } finally {
    spy.mockRestore();
  }
}

/** Run `src` on both backends, invoking `-main` when present; returns both outputs. */
export async function both(src: string): Promise<{ js: string; as: string }> {
  const hasMain = /\(defn\s+(\^[^\s]+\s+)?-main\b/.test(src);
  const js = await runJs(src, hasMain ? ['_main'] : []);
  const as = await runKisoAs(src);
  if (hasMain) as.exports.main!();
  return { js: js.output, as: as.output };
}
