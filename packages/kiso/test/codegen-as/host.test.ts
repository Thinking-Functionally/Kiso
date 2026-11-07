import { describe, it, expect } from 'vitest';
import { runKisoAs } from './helpers/build-wasm.js';

const withHost = (src: string, host = {}) => runKisoAs(src, { host });

describe('host/ functions (Node host)', () => {
  it('host/args returns a list of strings or nil', async () => {
    const r = await withHost('(defn -main [] (prn (host/args)))', { args: ['a', 'b c'] });
    r.runMain();
    expect(r.output).toBe('("a" "b c")\n');
    const e = await withHost('(defn -main [] (prn (host/args)))', { args: [] });
    e.runMain();
    expect(e.output).toBe('nil\n');
  });
  it('host/env', async () => {
    const r = await withHost('(defn -main [] (prn (host/env "HOME") (host/env "NOPE")))', { env: { HOME: '/h' } });
    r.runMain();
    expect(r.output).toBe('"/h" nil\n');
  });
  it('host/read-file and host/write-file', async () => {
    const files: Record<string, string> = { in: 'hello' };
    const r = await withHost('(defn -main [] (prn (host/read-file "in") (host/read-file "missing") (host/write-file "out" "x")))', {
      readFile: (p: string) => {
        if (!(p in files)) throw new Error('ENOENT');
        return files[p]!;
      },
      writeFile: (p: string, c: string) => void (files[p] = c),
    });
    r.runMain();
    expect(r.output).toBe('"hello" nil true\n');
    expect(files.out).toBe('x');
  });
  it('host/stdin and host/now', async () => {
    const r = await withHost('(defn -main [] (prn (host/stdin) (host/now)))', { stdin: () => 'in!', now: () => 42 });
    r.runMain();
    expect(r.output).toBe('"in!" 42\n');
  });
  it('host calls work at top level (during start)', async () => {
    const r = await withHost('(def a (host/args))\n(prn (first a))', { args: ['x'] });
    expect(r.output).toBe('"x"\n');
  });
  it('host/exit stops the program with a code', async () => {
    const r = await withHost('(defn -main [] (println "a") (host/exit 3) (println "b"))');
    expect(r.runMain()).toBe(3);
    expect(r.output).toBe('a\n');
  });
  it('rejects unknown host functions and wrong arity', async () => {
    await expect(withHost('(host/nope)')).rejects.toThrow(/unknown host function/);
    await expect(withHost('(host/env)')).rejects.toThrow(/expects 1/);
  });
});

describe('host/fetch (async, channel based)', () => {
  const NS = '(ns t (:require [clojure.core.async :refer [go <!]]))\n';
  const fakeFetch = async (url: string, o: { method?: string; body?: string }) => ({ status: 200, headers: { 'x-a': '1' }, body: `${o.method ?? 'GET'}:${url}:${o.body ?? ''}` });

  it('parks a go block until the host resolves the request', async () => {
    const r = await withHost(`${NS}(defn -main [] (go (let [r (<! (host/fetch "http://a/x" {:method "POST" :body "b"}))] (prn (:status r) (:body r) (get-in r [:headers :x-a])))))`, { fetch: fakeFetch });
    await r.runMainAsync();
    expect(r.output).toBe('200 "POST:http://a/x:b" "1"\n');
  });
  it('runs concurrent requests and resumes in completion order', async () => {
    const delays: Record<string, number> = { slow: 30, fast: 1 };
    const f = async (url: string) => {
      await new Promise((res) => setTimeout(res, delays[url]));
      return { status: 200, headers: {}, body: url };
    };
    const r = await withHost(`${NS}(defn -main [] (let [a (host/fetch "slow" {}) b (host/fetch "fast" {})] (go (prn (:body (<! a)))) (go (prn (:body (<! b))))))`, { fetch: f });
    await r.runMainAsync();
    expect(r.output).toBe('"fast"\n"slow"\n');
  });
  it('delivers a network failure as {:error msg} instead of throwing', async () => {
    const r = await withHost(`${NS}(defn -main [] (go (prn (:error (<! (host/fetch "u" {}))))))`, { fetch: async () => { throw new Error('boom'); } });
    await r.runMainAsync();
    expect(r.output).toBe('"boom"\n');
  });
  it('sequential fetches inside one go block', async () => {
    const r = await withHost(`${NS}(defn -main [] (go (let [a (<! (host/fetch "1" {})) b (<! (host/fetch "2" {}))] (prn (str (:body a) (:body b))))))`, { fetch: async (u: string) => ({ status: 200, headers: {}, body: u }) });
    await r.runMainAsync();
    expect(r.output).toBe('"12"\n');
  });
});
