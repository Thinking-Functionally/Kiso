import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type GcRuntime = 'incremental' | 'minimal' | 'stub';
export type BuildOptions = { optimize?: boolean; runtime?: GcRuntime };

const REGEX_PATH = fileURLToPath(new URL('../../as-runtime/kiso-regex.ts', import.meta.url));
const JSON_PATH = fileURLToPath(new URL('../../as-runtime/kiso-json.ts', import.meta.url));

// src/codegen-as and dist/codegen-as are both two levels below the package root
const RUNTIME_PATH = fileURLToPath(new URL('../../as-runtime/kiso-runtime.ts', import.meta.url));

/** Compile generated AssemblyScript (plus the Kiso runtime) to a wasm binary with the `asc` API. */
export async function buildWasm(asSource: string, opts: BuildOptions = {}): Promise<Uint8Array> {
  let asc: typeof import('assemblyscript/asc');
  try {
    asc = await import('assemblyscript/asc');
  } catch {
    throw new Error('building wasm requires the "assemblyscript" package; install it with: npm install assemblyscript');
  }
  const files: Record<string, string> = {
    'main.ts': asSource,
    'kiso-runtime.ts': readFileSync(RUNTIME_PATH, 'utf8'),
    'kiso-json.ts': readFileSync(JSON_PATH, 'utf8'),
    'kiso-regex.ts': readFileSync(REGEX_PATH, 'utf8'),
  };
  let binary: Uint8Array | null = null;
  let stderr = '';
  const args = [
    'main.ts', '--outFile', 'out.wasm', '--runtime', opts.runtime ?? 'minimal',
    '--importMemory', '--noAssert', '--exportRuntime', '--exportStart', '_start',
  ];
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
