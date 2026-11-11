import { defaultLinker, type WasmSource } from './wasm-link.js';

/** Registers a wasm module under a logical name used by `defwasm` (async compile; accepts bytes, Module, Instance or a fetch Response). */
export function registerWasm(name: string, source: WasmSource | Response | Promise<Response>): Promise<void> {
  return defaultLinker.registerAsync(name, source);
}

/** `host/wasm-call`: marshals through the shared linker so JS and AS behave identically. */
export function host_wasm_call(module: string, exportName: string, sig: string, ...args: unknown[]): unknown {
  return defaultLinker.call(module, exportName, sig, args);
}
