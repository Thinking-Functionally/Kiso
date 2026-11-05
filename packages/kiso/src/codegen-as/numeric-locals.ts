// Unboxed numeric locals (D20): a local whose every definition is a number-typed expression is
// stored as a native f64 and boxed only where it flows into a Value context.
// Arithmetic always yields a number (or aborts), so `(+ a b)` is number-typed even when `a`/`b` are boxed.

import type { LExpr, LStmt } from './lowered.js';

export const ARITH_OPS = new Set(['+', '-', '*', '/', 'mod', 'rem', 'inc', 'dec']);

export function isArithCall(e: LExpr, globals: Set<string>): e is Extract<LExpr, { type: 'invoke' }> {
  if (e.type !== 'invoke' || e.fn.type !== 'var' || e.fn.kind !== 'global') return false;
  if (globals.has(e.fn.name) || !ARITH_OPS.has(e.fn.name)) return false;
  const n = e.args.length;
  switch (e.fn.name) {
    case '+':
    case '*':
      return true;
    case '-':
      return n >= 1;
    case 'inc':
    case 'dec':
      return n === 1;
    default:
      return n === 2;
  }
}

export function isNumTyped(e: LExpr, nums: Set<string>, globals: Set<string>): boolean {
  if (e.type === 'literal') return e.jsType === 'number';
  if (e.type === 'var') return e.kind === 'local' && nums.has(e.name);
  return isArithCall(e, globals);
}

export function inferNumericLocals(body: LStmt[], params: string[], globals: Set<string>): Set<string> {
  const defs: { name: string; value: LExpr | null }[] = [];
  const walk = (list: LStmt[]): void => {
    for (const s of list) {
      if (s.type === 'let') defs.push({ name: s.name, value: s.init });
      else if (s.type === 'assign') defs.push({ name: s.name, value: s.value });
      else if (s.type === 'if') {
        walk(s.then);
        walk(s.else);
      } else if (s.type === 'loop') walk(s.body);
      else if (s.type === 'try') {
        walk(s.body);
        s.catches.forEach((c) => walk(c.body));
        if (s.finalizer) walk(s.finalizer);
      }
    }
  };
  walk(body);
  const letNames = new Set<string>();
  const collectLets = (list: LStmt[]): void => {
    for (const s of list) {
      if (s.type === 'let') letNames.add(s.name);
      else if (s.type === 'if') {
        collectLets(s.then);
        collectLets(s.else);
      } else if (s.type === 'loop') collectLets(s.body);
      else if (s.type === 'try') {
        collectLets(s.body);
        s.catches.forEach((c) => collectLets(c.body));
        if (s.finalizer) collectLets(s.finalizer);
      }
    }
  };
  collectLets(body);
  const nums = new Set([...letNames].filter((n) => !params.includes(n)));
  // A let of null init (uninitialized temp) stays a candidate; its assignments decide.
  for (let changed = true; changed; ) {
    changed = false;
    for (const d of defs) {
      if (!nums.has(d.name)) continue;
      if (d.value !== null && !isNumTyped(d.value, nums, globals)) {
        nums.delete(d.name);
        changed = true;
      }
    }
  }
  return nums;
}
