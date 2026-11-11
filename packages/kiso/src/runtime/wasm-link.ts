/**
 * Host-side linker for wasm modules called from Kiso code (design 09). Both backends marshal through
 * `WasmLinker.call`, so a `defwasm` function behaves the same on JS and AS.
 *
 * Module ABI (plain C, produced by the `kiso-ffi` crate): `kiso_alloc(len)`, `kiso_free(ptr, len)`,
 * optional `kiso_last_error()`. A string result is one i64 packed as `(len << 32) | ptr`; 0 means failure.
 */

type ArrayCtor = Float64ArrayConstructor | Int32ArrayConstructor | Uint8ArrayConstructor;
const ARRAYS: Record<string, ArrayCtor> = { D: Float64Array, I: Int32Array, B: Uint8Array };

export type WasmSource = WebAssembly.Instance | WebAssembly.Module | BufferSource;

type Sig = { args: string[]; ret: string };

const SIG_CHARS = new Set(['i', 'd', 'b', 's', 'D', 'I', 'B']);
const sigCache = new Map<string, Sig>();

/** Parses `"ii>i"`: one char per argument (i d b s; D I B = f64/i32/u8 arrays), `>`, one return char (`v` = nil). */
export function parseSig(sig: string): Sig {
  const known = sigCache.get(sig);
  if (known) return known;
  const m = /^([a-zA-Z]*)>([a-zA-Z])$/.exec(sig);
  if (!m) throw new Error(`wasm: invalid signature "${sig}"`);
  const args = [...m[1]!];
  for (const c of args) if (!SIG_CHARS.has(c)) throw new Error(`wasm: unsupported argument type '${c}' in "${sig}"`);
  const ret = m[2]!;
  if (!SIG_CHARS.has(ret) && ret !== 'v') throw new Error(`wasm: unsupported return type '${ret}' in "${sig}"`);
  const parsed = { args, ret };
  sigCache.set(sig, parsed);
  return parsed;
}

type Exports = {
  memory: WebAssembly.Memory;
  kiso_alloc?: (len: number) => number;
  kiso_free?: (ptr: number, len: number) => void;
  kiso_last_error?: () => bigint;
  [name: string]: unknown;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toInstance(source: WasmSource): WebAssembly.Instance {
  if (source instanceof WebAssembly.Instance) return source;
  const module = source instanceof WebAssembly.Module ? source : new WebAssembly.Module(source);
  return new WebAssembly.Instance(module, {});
}

export class WasmLinker {
  private modules = new Map<string, Exports>();

  /** Links a module synchronously (bytes are compiled in place; browsers limit this on the main thread). */
  register(name: string, source: WasmSource): void {
    this.modules.set(name, toInstance(source).exports as Exports);
  }

  /** Links a module with asynchronous compilation (also accepts a `fetch` Response). */
  async registerAsync(name: string, source: WasmSource | Response | Promise<Response>): Promise<void> {
    const resolved = await source;
    if (resolved instanceof Response) {
      // static hosts often omit the application/wasm content type, which streaming compilation requires
      const bytes = resolved.clone();
      try {
        this.modules.set(name, (await WebAssembly.instantiateStreaming(resolved, {})).instance.exports as Exports);
      } catch {
        this.modules.set(name, (await WebAssembly.instantiate(await bytes.arrayBuffer(), {})).instance.exports as Exports);
      }
    } else if (resolved instanceof WebAssembly.Instance || resolved instanceof WebAssembly.Module) {
      this.register(name, resolved);
    } else {
      this.modules.set(name, (await WebAssembly.instantiate(resolved, {})).instance.exports as Exports);
    }
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }

  clear(): void {
    this.modules.clear();
  }

  call(module: string, exportName: string, sig: string, args: unknown[]): unknown {
    const mod = this.modules.get(module);
    if (!mod) throw new Error(`wasm: module "${module}" is not registered`);
    const fn = mod[exportName];
    if (typeof fn !== 'function') throw new Error(`wasm: module "${module}" has no export "${exportName}"`);
    const { args: argTypes, ret } = parseSig(sig);
    if (args.length !== argTypes.length) {
      throw new Error(`wasm: ${module}/${exportName} expects ${argTypes.length} argument(s), got ${args.length}`);
    }

    const borrowed: [number, number][] = [];
    const flat: (number | bigint)[] = [];
    try {
      for (let i = 0; i < argTypes.length; i++) {
        const v = args[i];
        switch (argTypes[i]) {
          case 'i': flat.push(asNumber(v, 'i32', module, exportName)); break;
          case 'd': flat.push(asNumber(v, 'f64', module, exportName)); break;
          case 'D':
          case 'I':
          case 'B': {
            const ctor = ARRAYS[argTypes[i]!]!;
            if (v === null || v === undefined || typeof v === 'string' || typeof (v as ArrayLike<number>).length !== 'number') {
              throw new Error(`wasm: ${module}/${exportName} argument ${i} must be an array of numbers`);
            }
            const typed = ctor.from(v as ArrayLike<number>);
            const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
            const ptr = this.writeBytes(mod, bytes);
            borrowed.push([ptr, bytes.length]);
            flat.push(ptr, typed.length);
            break;
          }
          case 'b': flat.push(v === null || v === undefined || v === false ? 0 : 1); break;
          case 's': {
            if (typeof v !== 'string') throw new Error(`wasm: ${module}/${exportName} argument ${i} must be a string`);
            const bytes = encoder.encode(v);
            const ptr = this.writeBytes(mod, bytes);
            borrowed.push([ptr, bytes.length]);
            flat.push(ptr, bytes.length);
            break;
          }
        }
      }
      const result = (fn as (...a: (number | bigint)[]) => unknown)(...flat);
      switch (ret) {
        case 'v': return undefined;
        case 'i': return result as number;
        case 'd': return result as number;
        case 'b': return (result as number) !== 0;
        case 's': return decoder.decode(this.readPacked(mod, result as bigint, module, exportName));
        default: {
          const bytes = this.readPacked(mod, result as bigint, module, exportName);
          const ctor = ARRAYS[ret]!;
          // copy into a fresh aligned buffer; the module's bytes may sit at any offset
          return new ctor(bytes.slice().buffer);
        }
      }
    } finally {
      for (const [ptr, len] of borrowed) mod.kiso_free?.(ptr, len);
    }
  }

  private writeBytes(mod: Exports, bytes: Uint8Array): number {
    if (!mod.kiso_alloc) throw new Error('wasm: module does not export kiso_alloc');
    const ptr = mod.kiso_alloc(bytes.length);
    new Uint8Array(mod.memory.buffer, ptr, bytes.length).set(bytes);
    return ptr;
  }

  private readPacked(mod: Exports, packed: bigint, module: string, exportName: string): Uint8Array {
    if (packed === 0n) throw new Error(`wasm: ${module}/${exportName} failed: ${this.lastError(mod)}`);
    const ptr = Number(packed & 0xffffffffn);
    const len = Number(packed >> 32n);
    const bytes = new Uint8Array(mod.memory.buffer, ptr, len).slice();
    mod.kiso_free?.(ptr, len);
    return bytes;
  }

  private lastError(mod: Exports): string {
    const packed = mod.kiso_last_error?.() ?? 0n;
    if (packed === 0n) return 'unknown error';
    const ptr = Number(packed & 0xffffffffn);
    const len = Number(packed >> 32n);
    const text = decoder.decode(new Uint8Array(mod.memory.buffer, ptr, len));
    mod.kiso_free?.(ptr, len);
    return text;
  }
}

function asNumber(v: unknown, what: string, module: string, exportName: string): number {
  if (typeof v !== 'number') throw new Error(`wasm: ${module}/${exportName} expects a number for ${what}`);
  return v;
}

/** Linker used by the JS backend; the AS host creates its own per instance. */
export const defaultLinker = new WasmLinker();
