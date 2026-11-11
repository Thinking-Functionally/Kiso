import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../../src/cli/args.js';
import { buildCommand, runCommand } from '../../src/cli/build-command.js';
import { createWorker } from '../../src/host/worker.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ffi_fixture.wasm', import.meta.url));
const APP = '(defwasm add "fixture" [:i32 :i32] :i32)\n(defwasm upper "fixture" [:str] :str)\n(defn -main [] (println (add 2 3) (upper "ok")))';

describe('cli --wasm', () => {
  it('parses name=path pairs for run, serve and build', () => {
    expect(parseArgs(['run', 'a.cljs', '--wasm', 'solver=./s.wasm', '--wasm', 'b=b.wasm'])).toMatchObject({ wasm: { solver: './s.wasm', b: 'b.wasm' } });
    expect(parseArgs(['serve', 'a.cljs', '--wasm', 'x=y.wasm'])).toMatchObject({ wasm: { x: 'y.wasm' } });
    expect(parseArgs(['build', 'a.cljs', '--worker', '--wasm', 'x=y.wasm'])).toMatchObject({ wasm: { x: 'y.wasm' } });
  });
  it('leaves the runtime unset so FFI programs can pick the incremental GC', () => {
    expect(parseArgs(['run', 'a.cljs'])).toMatchObject({ runtime: undefined, wasm: {} });
  });
  it('rejects malformed specs', () => {
    expect(() => parseArgs(['run', 'a.cljs', '--wasm', 'nopath'])).toThrow(/name=path/);
    expect(() => parseArgs(['run', 'a.cljs', '--wasm', '=x.wasm'])).toThrow(/name=path/);
  });
});

describe('kiso run --wasm', () => {
  it('links a Rust module for defwasm', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiso-ffi-'));
    const src = join(dir, 'app.cljs');
    writeFileSync(src, APP);
    let out = '';
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => ((out += String(s)), true));
    try {
      expect(await runCommand({ file: src, exports: [], programArgs: [], wasm: { fixture: FIXTURE } })).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(out).toBe('5 OK\n');
  }, 60_000);
});

describe('kiso build --worker --wasm', () => {
  it('copies linked modules and wires them into the worker entry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiso-ffi-'));
    const src = join(dir, 'api.cljs');
    writeFileSync(src, '(defwasm add "fixture" [:i32 :i32] :i32)\n(defn handle [req] {:status 200 :body (str (add 1 2))})');
    const out = await buildCommand({ file: src, outFile: null, exports: [], worker: 'handle', outDir: dir, wasm: { fixture: FIXTURE } });
    expect(existsSync(join(dir, 'fixture.ffi.wasm'))).toBe(true);
    const entry = readFileSync(join(dir, 'worker.js'), 'utf-8');
    expect(entry).toContain("import ffi0 from './fixture.ffi.wasm';");
    expect(entry).toContain('createWorker(wasm, { wasm: { "fixture": ffi0 } })');

    const worker = createWorker(await WebAssembly.compile(readFileSync(out)), { wasm: { fixture: await WebAssembly.compile(readFileSync(FIXTURE)) } });
    const res = await worker.fetch(new Request('http://x/'));
    expect(await res.text()).toBe('3');
  }, 60_000);

  it('keeps the worker entry unchanged without --wasm', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiso-ffi-'));
    const src = join(dir, 'api.cljs');
    writeFileSync(src, '(defn handle [req] {:status 200 :body "hi"})');
    await buildCommand({ file: src, outFile: null, exports: [], worker: 'handle', outDir: dir });
    expect(readFileSync(join(dir, 'worker.js'), 'utf-8')).toContain('export default createWorker(wasm);');
  }, 60_000);
});
