// Test helper: compile generated AS source (+ runtime) to wasm with the asc API, run it in Node.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readAllStr } from '../../../src/reader/reader.js';
import { Analyzer } from '../../../src/analyzer/analyzer.js';
import { compile } from '../../../src/api/compiler.js';

const RUNTIME_PATH = fileURLToPath(new URL('../../../as-runtime/kiso-runtime.ts', import.meta.url));
const runtimeSrc = readFileSync(RUNTIME_PATH, 'utf8');

export type BuildOptions = { optimize?: boolean; runtime?: 'incremental' | 'minimal' | 'stub' };

export async function buildWasm(asSource: string, opts: BuildOptions = {}): Promise<Uint8Array> {
  const asc = await import('assemblyscript/asc');
  const files: Record<string, string> = { 'main.ts': asSource, 'kiso-runtime.ts': runtimeSrc };
  let binary: Uint8Array | null = null;
  let stderr = '';
  const args = ['main.ts', '--outFile', 'out.wasm', '--runtime', opts.runtime ?? 'incremental', '--importMemory', '--noAssert'];
  if (opts.optimize !== false) args.push('-O3');
  const { error } = await asc.main(args, {
    readFile: (name: string) => files[name] ?? null,
    writeFile: (name: string, data: string | Uint8Array) => {
      if (name.endsWith('.wasm')) binary = data as Uint8Array;
    },
    listFiles: () => [],
    stdout: { write: () => true } as never,
    stderr: { write: (s: string) => ((stderr += s), true) } as never,
  });
  if (error || !binary) throw new Error(`asc failed: ${error?.message ?? ''}\n${stderr}`);
  return binary;
}

export type Instance = { exports: Record<string, (...a: number[]) => number | void>; output: string };

export async function runWasm(bytes: Uint8Array): Promise<Instance> {
  // Host-provided memory so start-time output (before instantiate returns) can read strings
  const memory = new WebAssembly.Memory({ initial: 1 });
  const output = { text: '' };
  const getString = (ptr: number): string => {
    const len = new Uint32Array(memory.buffer)[(ptr - 4) >>> 2]! >>> 1;
    return String.fromCharCode(...new Uint16Array(memory.buffer, ptr, len));
  };
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      memory,
      abort: (msg: number, file: number, line: number, col: number) => {
        throw new Error(`abort: ${msg ? getString(msg) : ''} (${file ? getString(file) : ''}:${line}:${col})`);
      },
    },
    kiso: { write: (p: number) => void (output.text += getString(p)) },
  });
  return {
    exports: instance.exports as never,
    get output() {
      return output.text;
    },
  };
}

/** Compile Kiso source via the AS backend and run it. */
export async function runKisoAs(src: string, opts: BuildOptions = {}): Promise<Instance> {
  const { code } = compile(src, { target: 'as' });
  return runWasm(await buildWasm(code, opts));
}

export { readAllStr, Analyzer };
