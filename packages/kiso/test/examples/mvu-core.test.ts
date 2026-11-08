import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from '../../src/api/compiler.js';

const LIB = resolve(__dirname, '../../../../examples/_shared/mvu/core.cljs');
const OUT = resolve(__dirname, '.mvu-core.tmp.mjs');

// Scenarios run inside the compiled library module so they exercise the real cljs code.
const SCENARIOS = `
(def applies
  (let [s (create-store 0 (fn [m e] (+ m e)) nil)]
    (store-dispatch s 1) (store-dispatch s 2)
    @(store-model s)))

(def same-model-no-notify
  (let [s (create-store 0 (fn [m e] (if (= e :noop) m (inc m))) nil)
        n (atom 0)]
    (add-watch (store-model s) :w (fn [_ _ _ _] (swap! n inc)))
    (store-dispatch s :noop)
    (store-dispatch s :inc)
    @n))

(def effects-args
  (let [seen (atom [])
        s (create-store 0 (fn [m e] (+ m e)) (fn [m p e _] (swap! seen conj [m p e])))]
    (store-dispatch s 5)
    (pr-str @seen)))

(def queued-order
  (let [log (atom [])
        s (create-store 0
                        (fn [m e] (swap! log conj e) (inc m))
                        (fn [_ _ e d] (when (= e :a) (d :b) (swap! log conj :after-a))))]
    (store-dispatch s :a)
    (pr-str [@log @(store-model s)])))

(def recovers
  (let [s (create-store 0 (fn [m e] (if (= e :boom) (throw (js/Error. "x")) (inc m))) nil)]
    (try (store-dispatch s :boom) (catch :default _ nil))
    (store-dispatch s :ok)
    @(store-model s)))
`;

let mod: Record<string, unknown>;

beforeAll(async () => {
  const code = compile(readFileSync(LIB, 'utf-8') + SCENARIOS, { target: 'js' }).code;
  writeFileSync(OUT, code);
  mod = await import(pathToFileURL(OUT).href);
});

afterAll(() => rmSync(OUT, { force: true }));

describe('examples/_shared/mvu/core.cljs', () => {
  it('applies update-fn to the model', () => expect(mod.applies).toBe(3));
  it('does not notify watchers when update returns the same model', () => expect(mod.same_model_no_notify).toBe(1));
  it('passes model, prev, event to effects-fn', () => expect(mod.effects_args).toBe('[[5 0 5]]'));
  it('queues events dispatched from effects in order', () => expect(mod.queued_order).toBe('[[:a :after-a :b] 2]'));
  it('keeps working after update-fn throws', () => expect(mod.recovers).toBe(1));
});
