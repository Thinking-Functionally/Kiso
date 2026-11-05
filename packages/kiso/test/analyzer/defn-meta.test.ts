import { describe, it, expect } from 'vitest';
import { compile } from '../../src/api/compiler.js';

describe('defn with metadata on the name', () => {
  it('accepts ^:export and ^:private', () => {
    expect(compile('(defn ^:export foo [] 1)').code).toContain('function foo()');
    expect(compile('(defn ^:private bar [x] x)').code).toContain('function bar(x)');
  });
});
