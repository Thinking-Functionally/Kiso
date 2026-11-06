// Global hierarchy for isa?/derive (keywords and symbols; no Java class hierarchy, like ClojureScript).

import { equiv } from './equiv.js';
import { isVector } from './vector.js';
import { hashSet } from './hash-set.js';

const parentsOf: Array<[unknown, unknown[]]> = [];

function entry(tag: unknown): unknown[] | undefined {
  return parentsOf.find(([k]) => equiv(k, tag))?.[1];
}

function ancestorList(tag: unknown): unknown[] {
  const out: unknown[] = [];
  const stack = [...(entry(tag) ?? [])];
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (out.some((x) => equiv(x, p))) continue;
    out.push(p);
    stack.push(...(entry(p) ?? []));
  }
  return out;
}

function toSet(xs: unknown[]): unknown {
  return xs.length === 0 ? null : hashSet(...xs);
}

export function derive(tag: unknown, parent: unknown): null {
  if (equiv(tag, parent)) throw new Error('derive: tag and parent must differ');
  if (isa_p(parent, tag)) throw new Error(`derive: ${String(tag)} already has ${String(parent)} as ancestor (cyclic)`);
  const parents = entry(tag);
  if (parents) {
    if (!parents.some((p) => equiv(p, parent))) parents.push(parent);
  } else {
    parentsOf.push([tag, [parent]]);
  }
  return null;
}

export function underive(tag: unknown, parent: unknown): null {
  const parents = entry(tag);
  if (parents) {
    const i = parents.findIndex((p) => equiv(p, parent));
    if (i >= 0) parents.splice(i, 1);
  }
  return null;
}

export function parents(tag: unknown): unknown {
  return toSet([...(entry(tag) ?? [])]);
}

export function ancestors(tag: unknown): unknown {
  return toSet(ancestorList(tag));
}

export function descendants(tag: unknown): unknown {
  const out: unknown[] = [];
  for (const [k] of parentsOf) if (isa_p(k, tag) && !equiv(k, tag)) out.push(k);
  return toSet(out);
}

export function isa_p(child: unknown, parent: unknown): boolean {
  if (equiv(child, parent)) return true;
  if (ancestorList(child).some((a) => equiv(a, parent))) return true;
  if (isVector(child) && isVector(parent) && child.count === parent.count) {
    for (let i = 0; i < child.count; i++) if (!isa_p(child.nth(i), parent.nth(i))) return false;
    return true;
  }
  return false;
}
