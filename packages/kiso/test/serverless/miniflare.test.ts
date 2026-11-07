// Runs the compiled handler inside Cloudflare's real runtime (workerd) through Miniflare.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { resolve } from 'node:path';
import { compile } from '../../src/api/compiler.js';
import { buildWasm } from '../../src/codegen-as/build.js';

const APP = `(ns app (:require [clojure.core.async :refer [go <!]]))
(defn hello [req] {:status 200 :headers {:content-type "text/plain"} :body (str "hello " (get (:query req) :name "world"))})
(defn echo [req] {:status 201 :body {:method (:method req) :body (:body req) :path (:path req)}})
(defn proxy [req]
  (go (let [up (<! (host/fetch (str "http://upstream.test" (:path req)) {:method "GET"}))]
        (if (or (:error up) (>= (:status up) 500))
          {:status 502 :body (str "upstream failed: " (or (:error up) (:status up)))}
          {:status (:status up) :body (str "via-kiso:" (:body up))}))))
(defn handle [req]
  (case (:path req)
    "/hello" (hello req)
    "/echo" (echo req)
    {:status 404 :body "nope"}))
(defn handle-any [req]
  (if (#{"/proxy" "/proxy/down"} (:path req)) (proxy req) (handle req)))
`;

let mf: Miniflare;
let wasm: Uint8Array;
let workerJs: string;
const upstreamSeen: string[] = [];

beforeAll(async () => {
  wasm = await buildWasm(compile(APP, { target: 'as', worker: 'handle-any' }).code, { runtime: 'stub' });
  const bundled = await build({
    entryPoints: [resolve(__dirname, '../../src/host/worker.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'neutral',
    target: 'es2022',
  });
  workerJs = `${bundled.outputFiles[0]!.text}
import wasm from './app.wasm';
const w = createWorker(wasm);
export default { fetch: (req, env) => (new URL(req.url).pathname === '/__runtime' ? new Response(navigator.userAgent) : w.fetch(req, env)) };
`;
  mf = new Miniflare({
    modules: [
      { type: 'ESModule', path: 'worker.mjs', contents: workerJs },
      { type: 'CompiledWasm', path: 'app.wasm', contents: wasm },
    ],
    compatibilityDate: '2025-01-01',
    bindings: { GREETING: 'yo' },
    outboundService: async (req: Request) => {
      const url = new URL(req.url);
      upstreamSeen.push(url.pathname);
      if (url.pathname === '/proxy/down') throw new Error('connection refused');
      return new Response(`up:${url.pathname}`, { status: 203 });
    },
  });
  await mf.ready;
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

describe('Kiso worker on Cloudflare workerd (Miniflare)', () => {
  it('really runs inside workerd', async () => {
    expect(await (await mf.dispatchFetch('http://x/__runtime')).text()).toBe('Cloudflare-Workers');
  });
  it('serves a sync route with query parameters', async () => {
    const r = await mf.dispatchFetch('http://x/hello?name=kiso');
    expect([r.status, await r.text(), r.headers.get('content-type')]).toEqual([200, 'hello kiso', 'text/plain']);
  });
  it('encodes map bodies as JSON and passes method and body through', async () => {
    const r = await mf.dispatchFetch('http://x/echo', { method: 'POST', body: 'payload' });
    expect(r.status).toBe(201);
    expect(r.headers.get('content-type')).toBe('application/json');
    expect(await r.json()).toEqual({ method: 'POST', body: 'payload', path: '/echo' });
  });
  it('returns 404 from the handler for unknown routes', async () => {
    const r = await mf.dispatchFetch('http://x/zzz');
    expect([r.status, await r.text()]).toEqual([404, 'nope']);
  });
  it('awaits an upstream host/fetch inside a go-block handler', async () => {
    const r = await mf.dispatchFetch('http://x/proxy');
    expect([r.status, await r.text()]).toEqual([203, 'via-kiso:up:/proxy']);
    expect(upstreamSeen).toContain('/proxy');
  });
  it('maps an upstream 5xx to a 502 from the handler', async () => {
    const r = await mf.dispatchFetch('http://x/proxy/down');
    expect([r.status, await r.text()]).toEqual([502, 'upstream failed: 500']);
  });
  it('handles concurrent requests on independent instances', async () => {
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => mf.dispatchFetch(`http://x/hello?name=n${i}`)));
    expect(await Promise.all(rs.map((r) => r.text()))).toEqual(Array.from({ length: 8 }, (_, i) => `hello n${i}`));
  });
});
