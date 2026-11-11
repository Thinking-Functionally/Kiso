/**
 * Kiso-language tests (clojure.test subset) in test/kiso/*.cljs, run on the JS and AS backends.
 * Unlike the tests/clj baseline, every assertion must pass. A file may declare `;; expect: N` (the exact number
 * of assertions; required for go-block tests, where a block that never resumes would otherwise go unnoticed).
 * `;; targets: js` limits a file to the JS backend.
 * `;; wasm: name=path` (repeatable, path relative to the package root) links a wasm module for `defwasm`.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCounts, runAs, runJsAsync } from '../clj-suite/harness.js';
import { defaultLinker } from '../../src/runtime/wasm-link.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..', '..');
const DEFTEST = /\(\s*deftest\s+(?:\^[^\s]+\s+)?([^\s()[\]]+)/g;
const loadNs = (ns: string) => (ns === 'clojure.test' ? { source: '(ns clojure.test)' } : null);

for (const file of readdirSync(DIR).filter((f) => f.endsWith('_test.cljs'))) {
  const src = readFileSync(join(DIR, file), 'utf-8');
  const expected = /^;; expect: (\d+)/m.exec(src)?.[1];
  const targets = (/^;; targets: (.+)$/m.exec(src)?.[1] ?? 'js, as').split(',').map((t) => t.trim()) as ('js' | 'as')[];
  const wasm = Object.fromEntries([...src.matchAll(/^;; wasm: (\w[\w-]*)=(\S+)$/gm)].map((m) => [m[1]!, new Uint8Array(readFileSync(join(ROOT, m[2]!)))]));
  const names = [...src.matchAll(DEFTEST)].map((m) => m[1]!);

  describe(file, () => {
    for (const target of targets) {
      it(`passes every assertion on ${target}`, async () => {
        const each = /\(use-fixtures\s+:each\s+([^\s()]+)\)/.exec(src)?.[1];
        const once = /\(use-fixtures\s+:once\s+([^\s()]+)\)/.exec(src)?.[1];
        const call = (n: string) => (each ? `(${each} (fn [] (${n})))` : `(${n})`);
        const all = names.map(call).join(' ');
        const calls = once ? `(${once} (fn [] ${all}))` : all;
        const program = `${src}\n(defn -main [] ${calls})\n${target === 'js' ? '(-main)\n' : ''}`;
        defaultLinker.clear();
        for (const [name, bytes] of Object.entries(wasm)) defaultLinker.register(name, bytes);
        const out = target === 'js' ? await runJsAsync(program, loadNs) : await runAs(program, loadNs, wasm);
        let current = '?';
        const failures: string[] = [];
        for (const line of out.split('\n')) {
          const begin = /^CLJT begin (.*)$/.exec(line);
          if (begin) current = begin[1]!;
          else if (/^CLJT (fail|error)/.test(line)) failures.push(`[${current}] ${line}`);
        }
        expect(failures).toEqual([]);
        const { pass } = parseCounts(out);
        if (expected !== undefined) expect(pass).toBe(Number(expected));
        else expect(pass).toBeGreaterThan(0);
      }, 60_000);
    }
  });
}
