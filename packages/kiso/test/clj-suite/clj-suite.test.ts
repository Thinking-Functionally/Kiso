// Runs the clojure.test suites in tests/clj (origin: ClojureWasm) on the JS and AS backends and
// compares each outcome with baseline.json. The baseline is a ratchet: any change (better or worse)
// fails until reviewed and regenerated with `KISO_CLJ_UPDATE=1 npx vitest run test/clj-suite`.
// `KISO_CLJ_JVM=1` additionally runs every suite on JVM Clojure (`clj`) to prove the suites themselves are valid.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLJ_DIR, readSuites, runSuite, type Outcome } from './harness.js';

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'baseline.json');
const update = process.env.KISO_CLJ_UPDATE === '1';
const baseline: Record<string, Record<string, Outcome>> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf-8')) : {};
const suites = readSuites().filter((s) => !s.slow && s.requires.length === 0);
const fresh: Record<string, Record<string, Outcome>> = {};

describe('tests/clj suites', () => {
  for (const target of ['js', 'as'] as const) {
    for (const s of suites) {
      it(`${s.name} on ${target}`, async () => {
        const got = await runSuite(s, target);
        (fresh[s.name] ??= {})[target] = got;
        if (!update) expect(got).toEqual(baseline[s.name]?.[target]);
      }, 120_000);
    }
  }
  it('writes the baseline when asked', () => {
    if (update) writeFileSync(BASELINE, JSON.stringify(fresh, null, 2) + '\n');
  });
});

describe.runIf(process.env.KISO_CLJ_JVM === '1')('JVM Clojure oracle', () => {
  for (const s of suites) {
    it(`${s.name} passes on JVM`, () => {
      const call = s.kind === 'ns' ? `(cljtest.runner/run-namespaces "${s.name}" '[${s.spec.join(' ')}])` : `(cljtest.runner/run-files "${s.name}" [${s.spec.map((f) => `"${f}"`).join(' ')}])`;
      const paths = ['support', ...s.classpath].map((p) => `"${p}"`).join(' ');
      const out = execFileSync('clj', ['-Sdeps', `{:paths [${paths}]}`, '-M', '-e', `(require 'cljtest.runner) ${call}`], { cwd: CLJ_DIR, encoding: 'utf-8', timeout: 150_000 });
      const m = /:pass (\d+), :fail (\d+), :error (\d+)/.exec(out)!;
      expect(+m[2]! + +m[3]!).toBe(0);
      expect(+m[1]!).toBeGreaterThanOrEqual(s.min);
    }, 160_000);
  }
});
