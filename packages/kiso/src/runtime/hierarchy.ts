// Global hierarchy for isa?/derive (keywords and symbols; no Java class hierarchy, like ClojureScript).

import { equiv } from './equiv.js';
import { isVector } from './vector.js';
import { hashSet } from './hash-set.js';
import { hashMap } from './hash-map.js';
import { keyword } from './keyword.js';
import { get, assoc, dissoc, conj, contains_p } from './core.js';
import { disj } from './extras.js';
import { toArray } from './seq.js';

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

function deriveGlobal(tag: unknown, parent: unknown): null {
  if (equiv(tag, parent)) throw new Error('derive: tag and parent must differ');
  if (isaGlobal(parent, tag)) throw new Error(`derive: ${String(tag)} already has ${String(parent)} as ancestor (cyclic)`);
  const parents = entry(tag);
  if (parents) {
    if (!parents.some((p) => equiv(p, parent))) parents.push(parent);
  } else {
    parentsOf.push([tag, [parent]]);
  }
  return null;
}

function underiveGlobal(tag: unknown, parent: unknown): null {
  const parents = entry(tag);
  if (parents) {
    const i = parents.findIndex((p) => equiv(p, parent));
    if (i >= 0) parents.splice(i, 1);
  }
  return null;
}

function parentsGlobal(tag: unknown): unknown {
  return toSet([...(entry(tag) ?? [])]);
}

function ancestorsGlobal(tag: unknown): unknown {
  return toSet(ancestorList(tag));
}

function descendantsGlobal(tag: unknown): unknown {
  const out: unknown[] = [];
  for (const [k] of parentsOf) if (isaGlobal(k, tag) && !equiv(k, tag)) out.push(k);
  return toSet(out);
}

function isaGlobal(child: unknown, parent: unknown): boolean {
  if (equiv(child, parent)) return true;
  if (ancestorList(child).some((a) => equiv(a, parent))) return true;
  if (isVector(child) && isVector(parent) && child.count === parent.count) {
    for (let i = 0; i < child.count; i++) if (!isaGlobal(child.nth(i), parent.nth(i))) return false;
    return true;
  }
  return false;
}

// -- Custom hierarchies: persistent {:parents :ancestors :descendants} maps, as in ClojureScript --

const K_PARENTS = keyword('parents');
const K_ANCESTORS = keyword('ancestors');
const K_DESCENDANTS = keyword('descendants');

export function make_hierarchy(): unknown {
  return hashMap(K_PARENTS, hashMap(), K_DESCENDANTS, hashMap(), K_ANCESTORS, hashMap());
}

const rel = (h: unknown, k: unknown, tag: unknown): unknown => get(get(h, k), tag) ?? null;
const members = (xs: unknown): unknown[] => (xs == null ? [] : toArray(xs as any));

function link(m: unknown, source: unknown, sources: unknown, target: unknown, targets: unknown): unknown {
  let ret = m;
  for (const k of [source, ...members(get(sources, source))]) {
    let acc: unknown = get(targets, k) ?? hashSet();
    for (const t of [target, ...members(get(targets, target))]) acc = conj(acc, t);
    ret = assoc(ret, k, acc);
  }
  return ret;
}

function isaIn(h: unknown, child: unknown, parent: unknown): boolean {
  if (equiv(child, parent)) return true;
  if (contains_p(get(get(h, K_ANCESTORS), child) ?? hashSet(), parent)) return true;
  if (isVector(child) && isVector(parent) && child.count === parent.count) {
    for (let i = 0; i < child.count; i++) if (!isaIn(h, child.nth(i), parent.nth(i))) return false;
    return true;
  }
  return false;
}

function deriveIn(h: unknown, tag: unknown, parent: unknown): unknown {
  if (contains_p(get(get(h, K_PARENTS), tag) ?? hashSet(), parent)) return h;
  if (equiv(tag, parent)) throw new Error('derive: tag and parent must differ');
  const anc = get(h, K_ANCESTORS);
  if (contains_p(get(anc, tag) ?? hashSet(), parent) || contains_p(get(anc, parent) ?? hashSet(), tag)) {
    throw new Error('derive: cyclic hierarchy');
  }
  const ps = get(h, K_PARENTS);
  return hashMap(
    K_PARENTS, assoc(ps, tag, conj(get(ps, tag) ?? hashSet(), parent)),
    K_ANCESTORS, link(anc, tag, get(h, K_DESCENDANTS), parent, anc),
    K_DESCENDANTS, link(get(h, K_DESCENDANTS), parent, anc, tag, get(h, K_DESCENDANTS)),
  );
}

function underiveIn(h: unknown, tag: unknown, parent: unknown): unknown {
  const rest = disj(get(get(h, K_PARENTS), tag) ?? hashSet(), parent);
  const pm = members(rest).length > 0 ? assoc(get(h, K_PARENTS), tag, rest) : dissoc(get(h, K_PARENTS), tag);
  let acc = make_hierarchy();
  (pm as any).forEach((k: unknown, ps: unknown) => {
    for (const p of members(ps)) acc = deriveIn(acc, k, p);
  });
  return acc;
}

const nonEmpty = (xs: unknown): unknown => (members(xs).length > 0 ? xs : null);

export const derive = (...a: unknown[]): unknown => (a.length === 3 ? deriveIn(a[0], a[1], a[2]) : deriveGlobal(a[0], a[1]));
export const underive = (...a: unknown[]): unknown => (a.length === 3 ? underiveIn(a[0], a[1], a[2]) : underiveGlobal(a[0], a[1]));
export const isa_p = (...a: unknown[]): boolean => (a.length === 3 ? isaIn(a[0], a[1], a[2]) : isaGlobal(a[0], a[1]));
export const parents = (...a: unknown[]): unknown => (a.length === 2 ? nonEmpty(rel(a[0], K_PARENTS, a[1])) : parentsGlobal(a[0]));
export const ancestors = (...a: unknown[]): unknown => (a.length === 2 ? nonEmpty(rel(a[0], K_ANCESTORS, a[1])) : ancestorsGlobal(a[0]));
export const descendants = (...a: unknown[]): unknown => (a.length === 2 ? nonEmpty(rel(a[0], K_DESCENDANTS, a[1])) : descendantsGlobal(a[0]));
