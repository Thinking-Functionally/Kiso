// Runs one prebuilt benchmark artifact (JS bundle or wasm) on the current runtime (node or bun).
// usage: <node|bun> exec.mjs <js|wasm> <file> [runs]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [kind, file, runsArg] = process.argv.slice(2);
const runs = Number(runsArg ?? 5);
const times = [];
const out = process.stdout.write.bind(process.stdout);
process.stdout.write = () => true;
if (kind === 'js') {
  const mod = await import(pathToFileURL(file).href);
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    mod._main();
    times.push(performance.now() - t);
  }
} else {
  const { instantiateKiso } = await import('../dist/host/node.js');
  const bytes = readFileSync(file);
  for (let i = 0; i < runs; i++) {
    const inst = await instantiateKiso(bytes);
    const t = performance.now();
    inst.runMain();
    times.push(performance.now() - t);
  }
}
times.sort((a, b) => a - b);
out(JSON.stringify({ min: times[0], median: times[Math.floor(times.length / 2)] }) + '\n');
