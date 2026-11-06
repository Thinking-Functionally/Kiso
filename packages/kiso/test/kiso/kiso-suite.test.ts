/**
 * Kiso-language tests (clojure.test subset) in test/kiso/*.cljs, run on the JS and AS backends.
 * Unlike the tests/clj baseline, every assertion must pass. A file declares `;; expect: N` (the number of
 * assertions) so a go block that never resumes is a failure. `;; targets: js` limits a file to the JS backend.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCounts, runAs, runJsAsync } from '../clj-suite/harness.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const DEFTEST = /\(\s*deftest\s+(?:\^[^\s]+\s+)?([^\s()[\]]+)/g;
const loadNs = (ns: string) => (ns === 'clojure.test' ? { source: '(ns clojure.test)' } : null);

for (const file of readdirSync(DIR).filter((f) => f.endsWith('_test.cljs'))) {
  const src = readFileSync(join(DIR, file), 'utf-8');
  const expected = Number(/^;; expect: (\d+)/m.exec(src)?.[1] ?? NaN);
  const targets = (/^;; targets: (.+)$/m.exec(src)?.[1] ?? 'js, as').split(',').map((t) => t.trim()) as ('js' | 'as')[];
  const names = [...src.matchAll(DEFTEST)].map((m) => m[1]!);

  describe(file, () => {
    for (const target of targets) {
      it(`passes every assertion on ${target}`, async () => {
        const calls = names.map((n) => `(${n})`).join(' ');
        const program = `${src}\n(defn -main [] ${calls})\n${target === 'js' ? '(-main)\n' : ''}`;
        const out = target === 'js' ? await runJsAsync(program, loadNs) : await runAs(program, loadNs);
        const failures = out.split('\n').filter((l) => /^CLJT (fail|error)/.test(l));
        expect(failures).toEqual([]);
        expect(parseCounts(out).pass).toBe(expected);
      }, 60_000);
    }
  });
}
