import { describe, it, expect } from 'vitest';
import { readAllStr } from '../../src/reader/reader.js';
import { collectExports, listDefs, checkEntries } from '../../src/codegen-as/collect-exports.js';

describe('collectExports', () => {
  it('collects ^:export on defn and def', () => {
    const forms = readAllStr('(defn ^:export handle [req] req) (def ^:export answer 42) (defn hidden [] 1)');
    expect(collectExports(forms).map((e) => e.name)).toEqual(['handle', 'answer']);
  });

  it('supports ^{:export true} and rejects ^{:export false}', () => {
    const forms = readAllStr('(defn ^{:export true} a [] 1) (defn ^{:export false} b [] 1)');
    expect(collectExports(forms).map((e) => e.name)).toEqual(['a']);
  });

  it('includes -main implicitly when defined', () => {
    const forms = readAllStr('(defn -main [& args] args)');
    expect(collectExports(forms).map((e) => e.name)).toEqual(['-main']);
  });

  it('records source location and does not duplicate -main', () => {
    const forms = readAllStr('\n(defn ^:export -main [] 1)');
    const result = collectExports(forms);
    expect(result).toHaveLength(1);
    expect(result[0]!.line).toBe(2);
  });

  it('ignores non-def forms and defn- private', () => {
    const forms = readAllStr('(ns a.b) (println 1) (defn- ^:export p [] 1)');
    expect(collectExports(forms).map((e) => e.name)).toEqual(['p']);
  });
});

describe('listDefs / checkEntries', () => {
  it('lists top-level def names', () => {
    expect(listDefs(readAllStr('(def a 1) (defn b [] 1) (defn- c [] 1) (foo)'))).toEqual(['a', 'b', 'c']);
  });

  it('throws listing available defs when a required entry is missing', () => {
    const forms = readAllStr('(defn a [] 1) (defn b [] 2)');
    expect(() => checkEntries(forms, ['handle'])).toThrowError(/handle.*a, b/s);
  });

  it('passes when all required entries exist', () => {
    expect(() => checkEntries(readAllStr('(defn handle [] 1)'), ['handle'])).not.toThrow();
  });
});
