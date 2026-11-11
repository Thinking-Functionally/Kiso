import { toArray } from './seq.js';
import { isVector } from './vector.js';
import { defaultLinker, type WasmSource } from './wasm-link.js';

/** Registers a wasm module under a logical name used by `defwasm` (async compile; accepts bytes, Module, Instance or a fetch Response). */
export function registerWasm(name: string, source: WasmSource | Response | Promise<Response>): Promise<void> {
  return defaultLinker.registerAsync(name, source);
}

/** `host/wasm-call`: marshals through the shared linker so JS and AS behave identically. */
export function host_wasm_call(module: string, exportName: string, sig: string, ...args: unknown[]): unknown {
  const gt = sig.indexOf('>');
  // collections become plain arrays for the linker; array results come back as plain Arrays
  const prepared = args.map((a, i) => (i < gt && 'DIB'.includes(sig[i]!) && !Array.isArray(a) && !ArrayBuffer.isView(a) ? collToArray(a) : a));
  const result = defaultLinker.call(module, exportName, sig, prepared);
  return ArrayBuffer.isView(result) ? Array.from(result as unknown as ArrayLike<number>) : result;
}

function collToArray(a: unknown): unknown[] {
  if (!isVector(a)) return toArray(a as never);
  const out = new Array<unknown>(a.count);
  for (let i = 0; i < out.length; i++) out[i] = a.nth(i);
  return out;
}
