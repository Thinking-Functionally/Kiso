import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compile } from '../../src/api/compiler.js';
import { buildWasm } from '../../src/codegen-as/build.js';
import { instantiateKiso } from '../../src/host/node.js';

const fixture = new Uint8Array(readFileSync(new URL('../fixtures/ffi_fixture.wasm', import.meta.url)));

async function run(src: string, wasm: Record<string, Uint8Array> = { fixture }, runtime?: 'minimal' | 'incremental') {
  let out = '';
  const bytes = await buildWasm(compile(src, { target: 'as' }).code, { runtime });
  const inst = await instantiateKiso(bytes, { wasm, write: (s) => void (out += s) });
  return { inst, get out() { return out; } };
}

describe('wasm FFI on the AS backend', () => {
  it('aborts with the module message when the call fails', async () => {
    const r = await run('(defwasm fail-always "fixture" [] :str)\n(defn -main [] (fail-always))');
    expect(() => r.inst.runMain()).toThrow(/fail_always failed: fixture failure/);
  });

  it('aborts when the module is not linked', async () => {
    const r = await run('(defwasm add "fixture" [:i32 :i32] :i32)\n(defn -main [] (println (add 1 2)))', {});
    expect(() => r.inst.runMain()).toThrow(/module "fixture" is not registered/);
  });

  it("aborts on a non-string :str argument like the JS backend", async () => {
    const r = await run('(defwasm upper "fixture" [:str] :str)\n(defn -main [] (println (upper 5)))');
    expect(() => r.inst.runMain()).toThrow(/argument 0 must be a string/);
  });

  it('picks the incremental GC for FFI programs so the AS heap stays flat', async () => {
    const src = '(defwasm upper "fixture" [:str] :str)\n(defwasm sum-f64s "fixture" [:f64s] :f64)\n(def xs (vec (range 1000)))\n(defn -main [] (dotimes [_ 20000] (upper "hello world")) (dotimes [_ 200] (sum-f64s xs)) (println "ok"))';
    const r = await run(src, { fixture }, undefined);
    r.inst.runMain();
    expect(r.out).toBe('ok\n');
    expect(r.inst.memory.buffer.byteLength).toBeLessThan(4 * 1048576);
  }, 60_000);
});
