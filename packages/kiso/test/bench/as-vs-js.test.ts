// Manual benchmark (M2.5): KISO_BENCH=1 npx vitest run test/bench/as-vs-js.test.ts
import { it } from 'vitest';
import { compile } from '../../src/api/compiler.js';
import { buildWasm, runWasm } from '../codegen-as/helpers/build-wasm.js';
import { runJs } from '../codegen-as/helpers/differential.js';

const SRC = '(defn ^:export fib [n] (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2)))))';
const N = 32;

function time<T>(f: () => T): [T, number] {
  const t = performance.now();
  const r = f();
  return [r, performance.now() - t];
}

it.skipIf(!process.env.KISO_BENCH)('fib(32): JS backend vs AS/wasm', async () => {
  const js = await runJs(SRC);
  const [jr, jsMs] = time(() => js.exports.fib!(N));
  const rows: string[] = [`js            result=${String(jr)} ${jsMs.toFixed(0)}ms`];
  for (const runtime of ['incremental', 'minimal', 'stub'] as const) {
    const bytes = await buildWasm(compile(SRC, { target: 'as' }).code, { runtime });
    const [startMs, inst] = await (async () => {
      const t = performance.now();
      const i = await runWasm(bytes);
      return [performance.now() - t, i] as const;
    })();
    const [r, ms] = time(() => inst.exports.fib!(N));
    rows.push(`wasm ${runtime.padEnd(11)} result=${String(r)} ${ms.toFixed(0)}ms  size=${bytes.length}B  instantiate=${startMs.toFixed(1)}ms`);
  }
  console.log('\n' + rows.join('\n'));
}, 300_000);
