import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { compile } from '../api/compiler.js';
import { buildWasm, type GcRuntime } from '../codegen-as/build.js';
import { instantiateKiso } from '../host/node.js';

type Common = { file: string; runtime: GcRuntime; exports: string[] };

async function toWasm({ file, runtime, exports }: Common, worker?: string): Promise<Uint8Array> {
  const source = readFileSync(file, 'utf-8');
  const { code } = compile(source, { filename: basename(file), target: 'as', exports, worker });
  return buildWasm(code, { runtime });
}

/** `kiso build <file.cljs>`: Kiso -> AssemblyScript -> .wasm. Returns the output path. */
export async function buildCommand(
  o: Common & { outFile: string | null; worker?: string | null; outDir?: string | null },
): Promise<string> {
  const bytes = await toWasm(o, o.worker ?? undefined);
  const wasmName = basename(o.file).replace(/\.cljs$/, '.wasm');
  const dir = o.outDir ?? dirname(o.file);
  const out = o.outFile ?? join(dir, wasmName);
  mkdirSync(dirname(out), { recursive: true });
  if (o.worker) {
    const entry = join(dirname(out), 'worker.js');
    writeFileSync(entry, workerEntrySource(basename(out)));
    process.stderr.write(`wrote ${relative(process.cwd(), entry)}\n`);
  }
  writeFileSync(out, bytes);
  process.stderr.write(`built ${relative(process.cwd(), o.file)} -> ${relative(process.cwd(), out)} (${bytes.length} bytes)\n`);
  return out;
}

/** `kiso run <file.cljs>`: build in memory and run `-main` on the Node host. Returns the exit code. */
export async function runCommand(o: Common & { programArgs: string[] }): Promise<number> {
  const bytes = await toWasm(o);
  const inst = await instantiateKiso(bytes, { args: o.programArgs });
  return inst.runMain();
}

function workerEntrySource(wasmFile: string): string {
  return `import wasm from './${wasmFile}';
import { createWorker } from '@clojurewasm/kiso/host/worker';

export default createWorker(wasm);
`;
}
