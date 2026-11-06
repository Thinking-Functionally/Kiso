// Runs the ClojureWasm-origin clojure.test suites in tests/clj through a Kiso backend.
// A tiny clojure.test subset (is/testing/deftest) is injected as a prelude; project namespaces
// are linked by the compiler's module linker.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../../src/api/compiler.js';
import * as rt from '../../src/runtime/index.js';
import * as rtString from '../../src/runtime/string.js';
import * as rtSet from '../../src/runtime/set.js';
import * as rtEdn from '../../src/runtime/edn.js';

const here = dirname(fileURLToPath(import.meta.url));
export const CLJ_DIR = resolve(here, '../../../../tests/clj');

export type Suite = { name: string; kind: string; classpath: string[]; spec: string[]; min: number; requires: string[]; slow: boolean };
export type Counts = { pass: number; fail: number; error: number; skip: number };

const DEFTEST = /\(\s*(?:clojure\.test\/)?deftest\s+(?:\^[^\s]+\s+)?([^\s()\[\]]+)/g;

export function readSuites(): Suite[] {
  return readFileSync(join(CLJ_DIR, 'support/suites.txt'), 'utf-8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const [name, kind, cp, spec, min, req, slow] = l.split('|').map((x) => x.trim());
      const list = (x: string | undefined) => (!x || x === '-' ? [] : x.split(','));
      return { name: name!, kind: kind!, classpath: list(cp), spec: list(spec), min: Number(min), requires: list(req), slow: slow === 'yes' };
    });
}


/** Build one Kiso program for a suite: linked namespaces + a `-main` that runs every deftest. */
export function suiteSource(s: Suite, target: 'js' | 'as'): { source: string; loadNs: (ns: string) => { source: string } | null } {
  const sources: string[] = [];
  const loadNs = (ns: string) => {
    if (ns === 'clojure.test') return { source: '(ns clojure.test)' };
    for (const cp of s.classpath) {
      const p = join(CLJ_DIR, cp, ns.replace(/\./g, '/').replace(/-/g, '_') + '.clj');
      if (existsSync(p)) {
        const source = readFileSync(p, 'utf-8');
        sources.push(source);
        return { source };
      }
    }
    return null;
  };
  let head: string;
  if (s.kind === 'ns') {
    head = `(ns suite.main (:require [clojure.test] ${s.spec.map((n) => `[${n}]`).join(' ')}))\n`;
  } else {
    // Top-level (require …) forms only load libraries; namespaces are linked by the compiler instead.
    const files = s.spec.map((f) => readFileSync(join(CLJ_DIR, f), 'utf-8').replace(/^\(require\b.*\)\s*$/gm, ''));
    sources.push(...files);
    head = `(ns suite.main (:require [clojure.test]))\n` + files.join('\n') + '\n';
  }
  // Root-ns forms for `ns` suites live in the required files, which loadNs records lazily; resolve them now.
  if (s.kind === 'ns') for (const n of s.spec) loadNs(n);
  const names = [...new Set(sources.flatMap((src) => [...src.matchAll(DEFTEST)].map((m) => m[1]!)))];
  const calls = names.map((n) => (target === 'js' ? `(try (${n}) (catch :default e (println "CLJT error" "${n}" (str e))))` : `(${n})`));
  return { source: `${head}\n(defn -main [] ${calls.join(' ')})\n${target === 'js' ? '(-main)\n' : ''}`, loadNs };
}

export function parseCounts(out: string): Counts {
  const c: Counts = { pass: 0, fail: 0, error: 0, skip: 0 };
  for (const m of out.matchAll(/^CLJT (pass|fail|error|skip)/gm)) c[m[1] as keyof Counts]++;
  return c;
}

export function runJs(src: string, loadNs: (ns: string) => { source: string } | null): string {
  const code = compile(src, { target: 'js', loadNs, features: ['cljs'], testMacros: true })
    .code.replace(/^import '[^']+';\s*$/gm, '')
    .replace(/^import \* as (\w+) from '([^']+)';\s*$/gm, (_m, v: string, mod: string) => `const ${v} = ${mod === 'clojure/string.js' ? '__str' : mod === 'clojure/set.js' ? '__set' : mod === 'clojure/edn.js' ? '__edn' : '{}'};`)
    .replace(/^import \{([^}]*)\} from [^;]+;\s*$/gm, (_m, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`)
    .replace(/^export (let|const|function) /gm, '$1 ');
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  try {
    // eslint-disable-next-line no-new-func -- test-only: evaluating compiler output
    new Function('__rt', '__str', '__set', '__edn', code)(rt, rtString, rtSet, rtEdn);
  } finally {
    console.log = orig;
  }
  return lines.join('\n');
}

export async function runAs(src: string, loadNs: (ns: string) => { source: string } | null): Promise<string> {
  const { code } = compile(src, { target: 'as', loadNs, testMacros: true });
  const { buildWasm } = await import('../../src/codegen-as/build.js');
  const { instantiateKiso } = await import('../../src/host/node.js');
  let text = '';
  const inst = await instantiateKiso(await buildWasm(code, { runtime: 'minimal' }), { write: (s: string) => void (text += s) });
  inst.runMain();
  return text;
}

export type Outcome = ({ status: 'ran' } & Counts) | { status: 'unsupported' | 'broken'; reason: string };

const oneLine = (e: unknown) => String((e as Error).message ?? e).split('\n')[0]!.slice(0, 200);

/** Run one suite on a backend; compile-time rejections are `unsupported`, runtime crashes `broken`. */
export async function runSuite(s: Suite, target: 'js' | 'as'): Promise<Outcome> {
  const { source, loadNs } = suiteSource(s, target);
  let out: string;
  try {
    out = target === 'js' ? runJs(source, loadNs) : await runAs(source, loadNs);
  } catch (e) {
    const compileError = /AssemblyScript backend|not found in the project sources|CompileError|try is not supported/.test(String(e)) || (e as Error).name === 'CompileError';
    return { status: compileError ? 'unsupported' : 'broken', reason: oneLine(e) };
  }
  return { status: 'ran', ...parseCounts(out) };
}
