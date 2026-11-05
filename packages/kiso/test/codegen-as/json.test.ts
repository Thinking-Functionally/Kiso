import { describe, it, expect } from 'vitest';
import { runKisoAs } from './helpers/build-wasm.js';
import { compile } from '../../src/api/compiler.js';
import { buildWasm } from '../../src/codegen-as/build.js';
import { createWorker } from '../../src/host/worker.js';

const run = async (src: string) => {
  const r = await runKisoAs(src);
  r.exports.main!();
  return r.output;
};

describe('host/json-*', () => {
  it('parses objects with keyword keys, arrays, null, bools, numbers', async () => {
    const out = await run(
      '(defn -main [] (let [m (host/json-parse "{\\"a\\":[1,2.5,null,true],\\"b\\":{\\"c\\":\\"x\\\\ny\\"}}")] (prn (:a m) (:c (:b m)))))',
    );
    expect(out).toBe('[1 2.5 nil true] "x\\ny"\n');
  });
  it('stringifies maps, vectors, keywords, strings with escapes', async () => {
    const out = await run('(defn -main [] (println (host/json-stringify {:a [1 2 nil] :b "q\\"x" :c :k})))');
    expect(out).toBe('{"a":[1,2,null],"b":"q\\"x","c":"k"}\n');
  });
  it('round trips', async () => {
    const out = await run(
      '(defn -main [] (println (host/json-stringify (host/json-parse "{\\"n\\":{\\"x\\":[1,{\\"y\\":false}]}}"))))',
    );
    expect(out).toBe('{"n":{"x":[1,{"y":false}]}}\n');
  });
});

const APP = `
(defn route [req]
  (let [m (:method req) p (:path req)]
    (cond
      (and (= m "GET") (= p "/")) {:status 200 :headers {"content-type" "text/plain"} :body "hello"}
      (= p "/json") {:status 201 :body {:ok true :q (:q (:query req)) :n [1 2 3]}}
      (= p "/echo") {:status 200 :body (str (:body req) "|" (:x-t (:headers req)))}
      (= p "/env") {:status 200 :body (str (host/env "GREETING"))}
      :else {:status 404 :body "nope"})))
(defn handle [req] (route req))
`;

describe('worker entry (createWorker)', () => {
  it('requires the handler to exist', () => {
    expect(() => compile('(defn x [r] r)', { target: 'as', worker: 'handle' })).toThrow(/handle/);
  });
  it('serves requests with fresh instances', async () => {
    const { code } = compile(APP, { target: 'as', worker: 'handle' });
    const mod = await WebAssembly.compile(await buildWasm(code, {}));
    const w = createWorker(mod);
    const get = await w.fetch(new Request('http://x/'), {});
    expect([get.status, await get.text(), get.headers.get('content-type')]).toEqual([200, 'hello', 'text/plain']);
    const j = await w.fetch(new Request('http://x/json?q=zz'), {});
    expect(j.status).toBe(201);
    expect(j.headers.get('content-type')).toBe('application/json');
    expect(await j.json()).toEqual({ ok: true, q: 'zz', n: [1, 2, 3] });
    const e = await w.fetch(new Request('http://x/echo', { method: 'POST', body: 'b', headers: { 'x-t': 'h' } }), {});
    expect(await e.text()).toBe('b|h');
    const en = await w.fetch(new Request('http://x/env'), { GREETING: 'yo', OBJ: {} });
    expect(await en.text()).toBe('yo');
    const nf = await w.fetch(new Request('http://x/zzz'), {});
    expect([nf.status, await nf.text()]).toEqual([404, 'nope']);
  });
});
