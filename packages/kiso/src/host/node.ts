import { readFileSync, writeFileSync } from 'node:fs';
import { instantiateCore, type HostOptions, type KisoInstance } from './core.js';

export { ExitSignal, type KisoInstance } from './core.js';
export type NodeHostOptions = HostOptions;

/** Instantiate a Kiso wasm module with the Node host (fs, process.env, stdout, stdin). */
export function instantiateKiso(bytes: Uint8Array, opts: NodeHostOptions = {}): Promise<KisoInstance> {
  return instantiateCore(bytes, {
    env: process.env,
    write: (s) => void process.stdout.write(s),
    readFile: (p) => readFileSync(p, 'utf8'),
    writeFile: (p, c) => writeFileSync(p, c),
    stdin: () => readFileSync(0, 'utf8'),
    ...opts,
  });
}
