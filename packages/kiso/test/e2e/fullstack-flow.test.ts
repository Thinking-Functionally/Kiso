// Full-stack flow on the real examples/fullstack sources: one shared .cljc, a wasm API and a JS client.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildCommand } from '../../src/cli/build-command.js';
import { createWorker } from '../../src/host/worker.js';
import { both, runJs } from '../codegen-as/helpers/differential.js';

const EX = resolve(__dirname, '../../../../examples/fullstack/src/app');
const shared = readFileSync(join(EX, 'shared.cljc'), 'utf-8');
const client = readFileSync(join(EX, 'client.cljs'), 'utf-8');
// `api-version` differs per backend by design (#?(:as … :cljs …)); everything else must agree.
const sharedBody = shared.replace(/^\(ns app\.shared\)\s*/m, '').replace(/^\(def api-version.*$/m, '');

const INPUTS = ['"milk"', '""', '"x"', '(apply str (repeat 40 "a"))', '(apply str (repeat 41 "a"))', 'nil', '42', ':kw'];

describe('shared .cljc behaves identically on the JS and AS backends', () => {
  it('validate-todo over valid, empty, boundary, and non-string titles', async () => {
    const probe = `${sharedBody}\n(defn -main [] ${INPUTS.map((i) => `(prn (validate-todo {:title ${i}}))`).join(' ')})`;
    const r = await both(`(ns probe)\n${probe}`);
    expect(r.as).toBe(r.js);
    expect(r.js.trim().split('\n')).toEqual([
      '{:ok true}',
      '{:ok false, :error "title must be 1-40 characters"}',
      '{:ok true}',
      '{:ok true}',
      '{:ok false, :error "title must be 1-40 characters"}',
      '{:ok false, :error "title must be 1-40 characters"}',
      '{:ok false, :error "title must be 1-40 characters"}',
      '{:ok false, :error "title must be 1-40 characters"}',
    ]);
  });
  it('summarize', async () => {
    const probe = `${sharedBody}\n(defn -main [] (prn (summarize [])) (prn (summarize [{:done true} {:done false} {:done true}])))`;
    const r = await both(`(ns probe)\n${probe}`);
    expect(r.as).toBe(r.js);
    expect(r.js.trim().split('\n')).toEqual(['{:total 0, :done 0, :open 0}', '{:total 3, :done 2, :open 1}']);
  });
});

describe('browser client (JS) talking to the wasm API', () => {
  let worker: ReturnType<typeof createWorker>;
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiso-flow-'));
    const wasm = await buildCommand({ file: join(EX, 'api.cljs'), outFile: null, runtime: 'stub', exports: [], worker: 'handle', outDir: dir });
    worker = createWorker(await WebAssembly.compile(readFileSync(wasm)));
  }, 120_000);
  afterEach(() => vi.unstubAllGlobals());

  const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://app${path}`, init), {});

  it('server endpoints', async () => {
    expect(await (await call('/api/version')).json()).toEqual({ version: '1-wasm' });
    const created = await call('/api/todos', { method: 'POST', body: JSON.stringify({ title: 'milk' }) });
    expect([created.status, await created.json()]).toEqual([201, { todo: { title: 'milk' }, version: '1-wasm' }]);
    const bad = await call('/api/todos', { method: 'POST', body: JSON.stringify({ title: '' }) });
    expect([bad.status, await bad.json()]).toEqual([400, { ok: false, error: 'title must be 1-40 characters' }]);
    const sum = await call('/api/summary', { method: 'POST', body: JSON.stringify({ todos: [{ done: true }, { done: false }] }) });
    expect(await sum.json()).toEqual({ total: 2, done: 1, open: 1 });
    expect((await call('/nope')).status).toBe(404);
  });

  it('client accepts what the server accepts and rejects what the server rejects', async () => {
    const clientBody = client.replace(/^\(ns app\.client[\s\S]*?\]\)\)\s*/m, '').replace(/shared\//g, '');
    const { exports } = await runJs(`(ns probe)\n${sharedBody}\n${clientBody}`);
    const requests: Array<{ path: string; status: number }> = [];
    const alerts: string[] = [];
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      const res = await call(path, init);
      requests.push({ path, status: res.status });
      return res;
    });
    vi.stubGlobal('alert', (m: string) => void alerts.push(m));

    await (exports.submit_m as (t: string) => Promise<unknown>)('milk');
    expect(requests).toEqual([{ path: '/api/todos', status: 201 }]);
    expect(alerts).toEqual([]);

    // Invalid input never leaves the browser, and the server would have said the same thing
    await (exports.submit_m as (t: string) => unknown)('');
    expect(requests).toHaveLength(1);
    expect(alerts).toEqual(['title must be 1-40 characters']);
    const direct = await call('/api/todos', { method: 'POST', body: JSON.stringify({ title: '' }) });
    expect(((await direct.json()) as { error: string }).error).toBe(alerts[0]);
  });
});
