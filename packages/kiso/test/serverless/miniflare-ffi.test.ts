// A Rust wasm module called through defwasm from a Kiso handler inside workerd (precompiled CompiledWasm modules).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from '../../src/api/compiler.js';
import { buildWasm } from '../../src/codegen-as/build.js';

const APP = `(defwasm upper "fixture" [:str] :str)
(defwasm sum-f64s "fixture" [:f64s] :f64)
(defwasm edn-stats "fixture" [:edn] :edn)
(defwasm fail-always "fixture" [] :str)
(defn handle [req]
  (case (:path req)
    "/upper" {:status 200 :body (upper (get (:query req) :q ""))}
    "/sum" {:status 200 :body (str (sum-f64s [1.5 2.5 3]))}
    "/stats" {:status 200 :body (edn-stats {:xs [1 2 3]})}
    "/fail" {:status 200 :body (fail-always)}
    {:status 404 :body "nope"}))
`;

let mf: Miniflare;

beforeAll(async () => {
  const app = await buildWasm(compile(APP, { target: 'as', worker: 'handle' }).code);
  const bundled = await build({
    entryPoints: [resolve(__dirname, '../../src/host/worker.ts')],
    bundle: true, format: 'esm', write: false, platform: 'neutral', target: 'es2022',
  });
  const workerJs = `${bundled.outputFiles[0]!.text}
import app from './app.wasm';
import fixture from './fixture.wasm';
export default createWorker(app, { wasm: { fixture } });
`;
  mf = new Miniflare({
    modules: [
      { type: 'ESModule', path: 'worker.mjs', contents: workerJs },
      { type: 'CompiledWasm', path: 'app.wasm', contents: app },
      { type: 'CompiledWasm', path: 'fixture.wasm', contents: readFileSync(resolve(__dirname, '../fixtures/ffi_fixture.wasm')) },
    ],
    compatibilityDate: '2025-01-01',
  });
  await mf.ready;
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

describe('Rust wasm through defwasm on Cloudflare workerd', () => {
  it('marshals strings', async () => {
    expect(await (await mf.dispatchFetch('http://x/upper?q=h%C3%A9llo')).text()).toBe('HÉLLO');
  });
  it('marshals arrays', async () => {
    expect(await (await mf.dispatchFetch('http://x/sum')).text()).toBe('7');
  });
  it('marshals EDN', async () => {
    const r = await mf.dispatchFetch('http://x/stats');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ count: 3, sum: 6, max: 3 });
  });
  it('turns a Rust failure into a 500 carrying the module message', async () => {
    const r = await mf.dispatchFetch('http://x/fail');
    expect(r.status).toBe(500);
    expect(await r.text()).toMatch(/fail_always failed: fixture failure/);
  });
  it('keeps serving after a failure', async () => {
    expect(await (await mf.dispatchFetch('http://x/upper?q=ok')).text()).toBe('OK');
  });
});
