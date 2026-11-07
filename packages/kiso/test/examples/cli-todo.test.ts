import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from '../../src/api/compiler.js';
import { buildWasm } from '../../src/codegen-as/build.js';
import { instantiateKiso } from '../../src/host/node.js';
import { runCommand } from '../../src/cli/build-command.js';

const FILE = resolve(__dirname, '../../../../examples/cli-todo/src/todo/main.cljs');
let wasm: Uint8Array;

beforeAll(async () => {
  wasm = await buildWasm(compile(readFileSync(FILE, 'utf-8'), { target: 'as' }).code, { runtime: 'stub' });
}, 120_000);

/** Runs the CLI against an in-memory file system; returns stdout, exit code and the files. */
async function cli(args: string[], files: Record<string, string> = {}, stdin = '') {
  let out = '';
  const inst = await instantiateKiso(wasm, {
    args,
    stdin: () => stdin,
    write: (s) => void (out += s),
    readFile: (p) => {
      if (!(p in files)) throw new Error('ENOENT');
      return files[p]!;
    },
    writeFile: (p, c) => void (files[p] = c),
  });
  return { code: inst.runMain(), out, files };
}

describe('examples/cli-todo', () => {
  it('prints usage and exits 2 without a command', async () => {
    const r = await cli([]);
    expect([r.code, r.out]).toEqual([2, 'usage: todo <add|list|done|stats|import> ...\n']);
  });
  it('adds and lists todos, persisting JSON', async () => {
    const a = await cli(['add', 'buy', 'milk']);
    expect([a.code, a.out]).toEqual([0, 'added 1: buy milk\n']);
    expect(JSON.parse(a.files['todos.json']!)).toEqual([{ id: 1, title: 'buy milk', done: false }]);
    const b = await cli(['add', 'walk dog'], a.files);
    expect(b.out).toBe('added 2: walk dog\n');
    const l = await cli(['list'], b.files);
    expect(l.out).toBe('[ ] 1. buy milk\n[ ] 2. walk dog\n');
  });
  it('marks a todo done and reports stats', async () => {
    const files = { 'todos.json': JSON.stringify([{ id: 1, title: 'a', done: false }, { id: 2, title: 'b', done: false }]) };
    const d = await cli(['done', '2'], files);
    expect(d.out).toBe('done 2\n');
    expect((await cli(['list'], d.files)).out).toBe('[ ] 1. a\n[x] 2. b\n');
    expect((await cli(['stats'], d.files)).out).toBe('total 2, done 1, open 1\n');
  });
  it('fails with exit 1 on an unknown id and on an unknown command', async () => {
    const files = { 'todos.json': '[]' };
    const e = await cli(['done', '9'], files);
    expect([e.code, e.out]).toEqual([1, 'error: no todo with id 9\n']);
    const u = await cli(['frobnicate']);
    expect([u.code, u.out]).toEqual([2, 'usage: todo <add|list|done|stats|import> ...\n']);
  });
  it('imports one title per line from stdin', async () => {
    const r = await cli(['import'], {}, 'x\n\ny\n');
    expect(r.out).toBe('imported 2\n');
    expect(JSON.parse(r.files['todos.json']!).map((t: { title: string }) => t.title)).toEqual(['x', 'y']);
  });
});

describe('kiso run awaits host/fetch', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('runs a go block parked on host/fetch to completion', async () => {
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const f = join(mkdtempSync(join(tmpdir(), 'kiso-')), 'a.cljs');
    writeFileSync(f, '(ns a (:require [clojure.core.async :refer [go <!]]))\n(defn -main [] (go (println (:body (<! (host/fetch "http://u/" {}))))))');
    vi.stubGlobal('fetch', async () => new Response('pong'));
    const w = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runCommand({ file: f, runtime: 'stub', exports: [], programArgs: [] });
    const printed = w.mock.calls.map((c) => String(c[0])).join('');
    w.mockRestore();
    expect([code, printed]).toEqual([0, 'pong\n']);
  }, 60_000);
});
