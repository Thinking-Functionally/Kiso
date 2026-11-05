/** Thrown through wasm when the program calls `(host/exit n)`. */
export class ExitSignal extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

export type HostOptions = {
  args?: string[];
  env?: Record<string, string | undefined>;
  stdin?: () => string;
  write?: (s: string) => void;
  readFile?: (path: string) => string;
  writeFile?: (path: string, content: string) => void;
  now?: () => number;
};

/** Platform-neutral host; every capability has a portable default (no Node APIs). */

export type KisoInstance = {
  exports: Record<string, (...a: number[]) => number | void>;
  /** Runs `-main` if the module exports it. Returns the exit code (0 unless `host/exit` was called). */
  runMain(): number;
  /** Calls an exported `(string): string` function (e.g. `kiso_handle`), marshalling across linear memory. */
  callString(name: string, arg: string): string;
};

type RuntimeExports = { __new(size: number, id: number): number; _start(): void };

const STRING_ID = 2;

/** Instantiate a Kiso wasm module with the Node host (the `kiso` and `host` import namespaces). */
export async function instantiateCore(source: Uint8Array | WebAssembly.Module, opts: HostOptions = {}): Promise<KisoInstance> {
  const memory = new WebAssembly.Memory({ initial: 1 });
  let rt: RuntimeExports | null = null;
  const read = (ptr: number): string => {
    const len = new Uint32Array(memory.buffer)[(ptr - 4) >>> 2]! >>> 1;
    // Chunked so very long strings do not overflow the argument limit
    let out = '';
    const u16 = new Uint16Array(memory.buffer, ptr, len);
    for (let i = 0; i < len; i += 8192) out += String.fromCharCode(...u16.subarray(i, i + 8192));
    return out;
  };
  const alloc = (s: string): number => {
    const ptr = rt!.__new(s.length * 2, STRING_ID);
    const u16 = new Uint16Array(memory.buffer, ptr, s.length);
    for (let i = 0; i < s.length; i++) u16[i] = s.charCodeAt(i);
    return ptr;
  };
  const args = opts.args ?? [];
  const env = opts.env ?? {};
  const write = opts.write ?? (() => {});
  const readFile = opts.readFile ?? (() => { throw new Error('no fs'); });
  const writeFile = opts.writeFile ?? (() => { throw new Error('no fs'); });

  const imports = {
    env: {
      memory,
      abort: (msg: number, file: number, line: number, col: number) => {
        throw new Error(`abort: ${msg ? read(msg) : ''} (${file ? read(file) : ''}:${line}:${col})`);
      },
    },
    kiso: { write: (p: number) => write(read(p)) },
    host: {
      argc: () => args.length,
      arg: (i: number) => alloc(args[i]!),
      env: (n: number) => {
        const v = env[read(n)];
        return v === undefined ? 0 : alloc(v);
      },
      read_file: (p: number) => {
        try {
          return alloc(readFile(read(p)));
        } catch {
          return 0;
        }
      },
      write_file: (p: number, c: number) => {
        try {
          writeFile(read(p), read(c));
          return 1;
        } catch {
          return 0;
        }
      },
      stdin: () => alloc(opts.stdin ? opts.stdin() : ''),
      exit: (code: number) => {
        throw new ExitSignal(code);
      },
      now: () => (opts.now ?? Date.now)(),
    },
  };
  const instance: WebAssembly.Instance =
    source instanceof WebAssembly.Module
      ? await WebAssembly.instantiate(source, imports)
      : (await WebAssembly.instantiate(source as BufferSource, imports)).instance;
  rt = instance.exports as unknown as RuntimeExports;
  const exports = instance.exports as unknown as KisoInstance['exports'];
  const guarded = <T>(f: () => T): { code: number; value?: T } => {
    try {
      return { code: 0, value: f() };
    } catch (e) {
      if (e instanceof ExitSignal) return { code: e.code };
      throw e;
    }
  };
  const started = guarded(() => rt!._start());
  return {
    exports,
    runMain() {
      if (started.code !== 0) return started.code;
      return typeof exports.main === 'function' ? guarded(() => exports.main!()).code : 0;
    },
    callString(name, arg) {
      const f = exports[name] as unknown as ((p: number) => number) | undefined;
      if (typeof f !== 'function') throw new Error(`wasm export ${name} not found`);
      return read(f(alloc(arg)));
    },
  };
}
