// Benchmarks the JS and AssemblyScript backends on Node and Bun. Usage: node bench/run.mjs [runs]
// Requires `npm run build` (uses dist/) and, for the Bun columns, `bun` on PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const out = join(here, '.out');
const runs = process.argv[2] ?? '5';
const kiso = join(root, 'bin/kiso.js');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const hasBun = spawnSync('bun', ['--version']).status === 0;
const runtimes = ['node', ...(hasBun ? ['bun'] : [])];
const rows = [];

for (const f of readdirSync(join(here, 'programs')).filter((x) => x.endsWith('.cljs'))) {
  const name = f.replace('.cljs', '');
  const src = join(here, 'programs', f);
  execFileSync('node', [kiso, 'compile', src, '--out-dir', join(out, 'js-' + name)]);
  await build({
    entryPoints: [join(out, 'js-' + name, f.replace('.cljs', '.js'))],
    bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], conditions: ['import'],
    outfile: join(out, name + '.mjs'),
    alias: { '@clojurewasm/kiso/runtime': join(root, 'dist/runtime/index.js') },
    logLevel: 'error',
  });
  const wasm = join(out, name + '.wasm');
  execFileSync('node', [kiso, 'build', src, '-o', wasm]);
  const row = { program: name, 'wasm KB': (statSync(wasm).size / 1024).toFixed(1), 'js KB': (statSync(join(out, name + '.mjs')).size / 1024).toFixed(1) };
  for (const rt of runtimes) {
    for (const [kind, file] of [['js', join(out, name + '.mjs')], ['wasm', wasm]]) {
      const r = spawnSync(rt, [join(here, 'exec.mjs'), kind, file, runs], { encoding: 'utf8' });
      row[`${rt}/${kind} ms`] = r.status === 0 ? Number(JSON.parse(r.stdout.trim().split('\n').pop()).median).toFixed(1) : 'ERR';
      if (r.status !== 0) console.error(`${rt}/${kind}/${name}:`, (r.stderr || r.stdout).split('\n').slice(0, 3).join(' | '));
    }
  }
  rows.push(row);
}
console.table(rows);
