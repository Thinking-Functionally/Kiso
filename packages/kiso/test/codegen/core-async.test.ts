/**
 * core.async on the JS backend: go blocks are CPS-transformed (src/analyzer/go.ts)
 * onto the channel runtime (src/runtime/async.ts).
 */
import { describe, it, expect } from 'vitest';
import { compile } from '../../src/api/compiler.js';
import * as rt from '../../src/runtime/index.js';

async function run(src: string): Promise<string> {
  const code = compile(src, { target: 'js', features: ['cljs'] }).code
    .replace(/^import \{([^}]*)\} from [^;]+;\s*$/gm, (_m, n: string) => `const {${n.replace(/ as /g, ': ')}} = __rt;`)
    .replace(/^export (let|const|function) /gm, '$1 ')
    .replace(/^export let [^;]+;\s*$/gm, '');
  const out: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void out.push(a.join(' '));
  try {
    // eslint-disable-next-line no-new-func -- test-only: evaluating compiler output
    new Function('__rt', `${code}\n;if (typeof _main === 'function') _main();`)(rt);
    await new Promise((r) => setTimeout(r, 30));
  } finally {
    console.log = orig;
  }
  return out.join('\n');
}

const NS = '(ns t (:require [clojure.core.async :as a :refer [go chan <! >!]]))\n';
const prog = (body: string) => run(`${NS}(defn -main [] ${body})`);

describe('core.async (JS)', () => {
  it('go returns a channel with the body result', async () => {
    expect(await prog('(let [c (go (+ 1 2))] (go (println (<! c))))')).toBe('3');
  });

  it('put then take across go blocks', async () => {
    expect(await prog('(let [c (chan)] (go (>! c 42)) (go (println (<! c))))')).toBe('42');
  });

  it('alias-qualified names resolve', async () => {
    expect(await prog('(let [c (a/chan 1)] (a/put! c 5) (go (println (a/<! c))))')).toBe('5');
  });

  it('go-loop with a park in the loop body', async () => {
    expect(
      await prog(
        '(let [c (chan 3)] (go (>! c 1) (>! c 2) (>! c 3) (a/close! c)) ' +
          '(a/go-loop [acc 0] (let [v (<! c)] (if v (recur (+ acc v)) (println acc)))))',
      ),
    ).toBe('6');
  });

  it('park inside if / let / cond branches', async () => {
    expect(
      await prog(
        '(let [c (chan 1)] (go (>! c 7)) ' +
          '(go (let [x (<! c)] (println (if (> x 5) (str "big " (<! (go x))) "small")))))',
      ),
    ).toBe('big 7');
  });

  it('long go-loop does not overflow the stack', async () => {
    expect(await prog('(a/go-loop [i 0] (if (< i 50000) (recur (inc i)) (println i)))')).toBe('50000');
  });

  it('closed channel yields nil', async () => {
    expect(await prog('(let [c (chan)] (a/close! c) (go (println (pr-str (<! c)))))')).toBe('nil');
  });

  it('alts! picks the ready channel', async () => {
    expect(
      await prog(
        '(let [c1 (chan) c2 (chan 1)] (a/put! c2 :b) ' +
          '(go (let [[v p] (a/alts! [c1 c2])] (println v (= p c2)))))',
      ),
    ).toBe(':b true');
  });

  it('timeout parks without blocking', async () => {
    expect(await prog('(go (<! (a/timeout 5)) (println "done"))')).toBe('done');
  });

  it('dropping and sliding buffers', async () => {
    expect(
      await prog(
        '(let [d (chan (a/dropping-buffer 1)) s (chan (a/sliding-buffer 1))] ' +
          '(a/put! d 1) (a/put! d 2) (a/put! s 1) (a/put! s 2) ' +
          '(go (println (<! d) (<! s))))',
      ),
    ).toBe('1 2');
  });
});
