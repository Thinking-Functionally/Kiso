// Test helper: compile generated AS source to wasm and run it on the shipped Node host.
import { readAllStr } from '../../../src/reader/reader.js';
import { Analyzer } from '../../../src/analyzer/analyzer.js';
import { compile } from '../../../src/api/compiler.js';
import { buildWasm, type BuildOptions } from '../../../src/codegen-as/build.js';
import { instantiateKiso, type NodeHostOptions } from '../../../src/host/node.js';

export type { BuildOptions };
export { buildWasm };

export type Instance = { exports: Record<string, (...a: number[]) => number | void>; output: string; runMain(): number };

export async function runWasm(bytes: Uint8Array, host: NodeHostOptions = {}): Promise<Instance> {
  const output = { text: '' };
  const inst = await instantiateKiso(bytes, { ...host, write: (s) => void (output.text += s) });
  return {
    exports: inst.exports,
    get output() {
      return output.text;
    },
    runMain: () => inst.runMain(),
  };
}

/** Compile Kiso source via the AS backend and run it. */
export async function runKisoAs(src: string, opts: BuildOptions & { host?: NodeHostOptions } = {}): Promise<Instance> {
  const { code } = compile(src, { target: 'as' });
  return runWasm(await buildWasm(code, opts), opts.host);
}

export { readAllStr, Analyzer };
