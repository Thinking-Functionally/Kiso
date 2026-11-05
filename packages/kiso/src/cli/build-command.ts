import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { compile } from '../api/compiler.js';
import { buildWasm, type GcRuntime } from '../codegen-as/build.js';
import { instantiateKiso } from '../host/node.js';

type Common = { file: string; runtime: GcRuntime; exports: string[] };

async function toWasm({ file, runtime, exports }: Common): Promise<Uint8Array> {
  const source = readFileSync(file, 'utf-8');
  const { code } = compile(source, { filename: basename(file), target: 'as', exports });
  return buildWasm(code, { runtime });
}

/** `kiso build <file.cljs>`: Kiso -> AssemblyScript -> .wasm. Returns the output path. */
export async function buildCommand(o: Common & { outFile: string | null }): Promise<string> {
  const bytes = await toWasm(o);
  const out = o.outFile ?? join(dirname(o.file), basename(o.file).replace(/\.cljs$/, '.wasm'));
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
