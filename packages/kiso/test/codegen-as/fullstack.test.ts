import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAllStr } from '../../src/reader/reader.js';
import { compile } from '../../src/api/compiler.js';
import { buildCommand } from '../../src/cli/build-command.js';
import { createWorker } from '../../src/host/worker.js';

const show = (src: string, feats: string[] | null) =>
  readAllStr(src, feats).map((f) => JSON.stringify(f.data, (k, v) => (k === 'line' || k === 'col' ? undefined : v)));

describe('reader conditionals', () => {
  it('picks by feature priority, then :default', () => {
    expect(show('#?(:clj 1 :cljs 2)', ['cljs'])).toEqual(['{"type":"integer","value":2}']);
    expect(show('#?(:cljs 2 :as 3)', ['as', 'cljs'])).toEqual(['{"type":"integer","value":3}']);
    expect(show('#?(:clj 1 :default 9)', ['cljs'])).toEqual(['{"type":"integer","value":9}']);
  });
  it('drops non-matching forms and splices with #?@', () => {
    expect(show('[1 #?(:clj 2) 3]', ['cljs'])).toHaveLength(1);
    const v = readAllStr('[1 #?@(:cljs [2 3]) 4]', ['cljs'])[0]!.data as { items: unknown[] };
    expect(v.items).toHaveLength(4);
    const top = readAllStr('#?@(:cljs [(def a 1) (def b 2)])', ['cljs']);
    expect(top).toHaveLength(2);
  });
  it('is an error when features are not enabled', () => {
    expect(() => readAllStr('#?(:cljs 1)')).toThrow(/not enabled/);
    expect(() => readAllStr('#?(:cljs)', ['cljs'])).toThrow(/even/);
  });
});

describe('AS module linking + full-stack flow', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiso-fs-'));
    mkdirSync(join(dir, 'src/app'), { recursive: true });
    writeFileSync(
      join(dir, 'src/app/shared.cljc'),
      '(ns app.shared)\n(defn ok? [t] (> (count t) 0))\n(def tag #?(:as "wasm" :cljs "js"))',
    );
    writeFileSync(
      join(dir, 'src/app/api.cljs'),
      '(ns app.api (:require [app.shared :as s]))\n(defn handle [req] (if (s/ok? (:body req)) {:status 200 :body s/tag} {:status 400 :body "bad"}))',
    );
    return dir;
  };
  it('links, builds and serves; same .cljc also compiles for JS', async () => {
    const dir = setup();
    const out = join(dir, 'dist');
    const wasm = await buildCommand({ file: join(dir, 'src/app/api.cljs'), outFile: null, runtime: 'stub', exports: [], worker: 'handle', outDir: out });
    const w = createWorker(await WebAssembly.compile(readFileSync(wasm)));
    const ok = await w.fetch(new Request('http://x/', { method: 'POST', body: 'hi' }), {});
    expect([ok.status, await ok.text()]).toEqual([200, 'wasm']);
    expect((await w.fetch(new Request('http://x/', { method: 'POST', body: '' }), {})).status).toBe(400);
    const js = compile(readFileSync(join(dir, 'src/app/shared.cljc'), 'utf8'), { filename: 'shared.cljc' }).code;
    expect(js).toContain('"js"');
    expect(js).not.toContain('"wasm"');
  });
  it('reports missing namespaces and name collisions', () => {
    const dir = setup();
    writeFileSync(join(dir, 'src/app/clash.cljs'), '(ns app.clash (:require [app.shared :as s]))\n(defn ok? [x] x)\n(defn handle [r] r)');
    const load = (ns: string) => (ns === 'app.shared' ? { source: readFileSync(join(dir, 'src/app/shared.cljc'), 'utf8') } : null);
    expect(() => compile(readFileSync(join(dir, 'src/app/clash.cljs'), 'utf8'), { target: 'as', loadNs: load })).toThrow(/collision/);
    expect(() => compile('(ns a (:require [nope.x :as n]))', { target: 'as', loadNs: load })).toThrow(/not found/);
  });
});
