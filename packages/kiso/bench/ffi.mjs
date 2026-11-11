// Benchmarks calling Rust wasm through defwasm against equivalent pure ClojureScript, on the JS and AS backends (Node).
// Usage: node bench/ffi.mjs [runs]. Requires `npm run build` (uses dist/) and the prebuilt test fixture.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const out = join(here, '.out-ffi');
const runs = Number(process.argv[2] ?? 7);
const kiso = join(root, 'bin/kiso.js');
const fixture = readFileSync(join(root, 'test/fixtures/ffi_fixture.wasm'));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const write = process.stdout.write.bind(process.stdout);
const results = {};

for (const f of readdirSync(join(here, 'ffi')).filter((x) => x.endsWith('.cljs'))) {
  const name = f.replace('.cljs', '');
  const src = join(here, 'ffi', f);
  const jsDir = join(out, 'js-' + name);
  execFileSync('node', [kiso, 'compile', src, '--out-dir', jsDir]);
  const entry = join(out, name + '.entry.mjs');
  writeFileSync(entry, `import { registerWasm } from '@clojurewasm/kiso/runtime';
import { readFileSync } from 'node:fs';
await registerWasm('fixture', readFileSync(${JSON.stringify(join(root, 'test/fixtures/ffi_fixture.wasm'))}));
export const mod = await import(${JSON.stringify(join(jsDir, name + '.js'))});
`);
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(out, name + '.mjs'),
    alias: { '@clojurewasm/kiso/runtime': join(root, 'dist/runtime/index.js'), 'clojure/string.js': join(root, 'dist/runtime/string.js') }, logLevel: 'error',
  });
  const wasm = join(out, name + '.wasm');
  execFileSync('node', [kiso, 'build', src, '-o', wasm]);

  process.stdout.write = () => true;
  const { mod } = await import(pathToFileURL(join(out, name + '.mjs')).href);
  const jsTimes = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    mod._main();
    jsTimes.push(performance.now() - t);
  }
  const { instantiateKiso } = await import('../dist/host/node.js');
  const bytes = readFileSync(wasm);
  const asTimes = [];
  for (let i = 0; i < runs; i++) {
    const inst = await instantiateKiso(bytes, { wasm: { fixture } });
    const t = performance.now();
    inst.runMain();
    asTimes.push(performance.now() - t);
  }
  process.stdout.write = write;
  results[name] = { js: median(jsTimes), as: median(asTimes) };
}

const rows = [];
for (const w of ['sum', 'call', 'upper']) {
  const p = results['pure_' + w];
  const f = results['ffi_' + w];
  rows.push({ workload: w, 'js pure ms': p.js.toFixed(1), 'js ffi ms': f.js.toFixed(1), 'as pure ms': p.as.toFixed(1), 'as ffi ms': f.as.toFixed(1) });
}
console.table(rows);
