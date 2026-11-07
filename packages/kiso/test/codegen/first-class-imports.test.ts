import { describe, it, expect } from 'vitest';
import { compile } from '../../src/api/compiler.js';

describe('first-class runtime constructors', () => {
  it('imports vector and keyword when used only as values', () => {
    const r = compile('(ns t)\n(defn f [xs] (map-indexed vector (map keyword xs)))');
    const header = r.code.split('\n')[0];
    expect(header).toMatch(/\bvector\b/);
    expect(header).toMatch(/\bkeyword\b/);
  });
});
