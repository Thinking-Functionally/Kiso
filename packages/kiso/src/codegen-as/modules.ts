// AS module linking: `(:require [my.ns :as a :refer [x]])` for project-local namespaces.
// The AS backend compiles one flat module, so dependencies are inlined in dependency order
// and `a/foo` / `my.ns/foo` are rewritten to bare `foo`. Top-level names must therefore be
// unique across the linked namespaces (a collision is a compile error, never silent shadowing).

import { readAllStr } from '../reader/reader.js';
import type { Form } from '../reader/form.js';

export type NsSource = { source: string; filename?: string };
export type NsLoader = (ns: string) => NsSource | null;

export class LinkError extends Error {}

const sym = (f: Form | undefined) => (f?.data.type === 'symbol' ? f.data : null);
const kw = (f: Form | undefined) => (f?.data.type === 'keyword' ? f.data.name : null);
const items = (f: Form) => ('items' in f.data ? (f.data.items as Form[]) : null);

function isNsForm(f: Form): boolean {
  const it = f.data.type === 'list' ? (f.data.items as Form[]) : null;
  return !!it && sym(it[0])?.name === 'ns' && sym(it[0])?.ns === null;
}

/** Extract require specs from an ns form and return the form without its `:require` clauses. */
function splitNs(f: Form): { ns: string; names: Set<string>; stripped: Form } {
  const it = items(f)!;
  const ns = sym(it[1])?.name ?? '';
  const names = new Set<string>();
  const rest = it.filter((c) => {
    const ci = c.data.type === 'list' ? (c.data.items as Form[]) : null;
    if (!ci || kw(ci[0]) !== 'require') return true;
    for (const spec of ci.slice(1)) {
      const si = spec.data.type === 'vector' ? (spec.data.items as Form[]) : [spec];
      const target = sym(si[0]);
      if (!target) throw new LinkError(`unsupported :require spec in ${ns}`);
      names.add(target.name);
    }
    return false;
  });
  return { ns, names, stripped: { ...f, data: { type: 'list', items: rest } } };
}

type Spec = { ns: string; alias: string | null };

function requireSpecs(f: Form): Spec[] {
  const out: Spec[] = [];
  for (const c of items(f)!) {
    const ci = c.data.type === 'list' ? (c.data.items as Form[]) : null;
    if (!ci || kw(ci[0]) !== 'require') continue;
    for (const spec of ci.slice(1)) {
      const si = spec.data.type === 'vector' ? (spec.data.items as Form[]) : [spec];
      const target = sym(si[0])!.name;
      let alias: string | null = null;
      for (let i = 1; i < si.length; i += 2) {
        const k = kw(si[i]);
        if (k === 'as') alias = sym(si[i + 1])?.name ?? null;
        else if (k !== 'refer') throw new LinkError(`unsupported :require option :${k} for ${target}`);
      }
      out.push({ ns: target, alias });
    }
  }
  return out;
}

function rewrite(f: Form, map: Map<string, true>): Form {
  const d = f.data;
  if (d.type === 'symbol' && d.ns !== null && map.has(d.ns)) return { ...f, data: { ...d, ns: null } };
  let out = f;
  if ('items' in d) out = { ...f, data: { ...d, items: (d.items as Form[]).map((x) => rewrite(x, map)) } as Form['data'] };
  else if (d.type === 'tagged') out = { ...f, data: { ...d, form: rewrite(d.form, map) } };
  return out.meta ? { ...out, meta: rewrite(out.meta, map) } : out;
}

function topLevelNames(forms: Form[]): string[] {
  const names: string[] = [];
  for (const f of forms) {
    const it = f.data.type === 'list' ? (f.data.items as Form[]) : null;
    const head = sym(it?.[0])?.name;
    if (it && head && /^(def|defn|defn-|defonce|deftype|defrecord|defprotocol)$/.test(head)) {
      const n = sym(it[1]);
      if (n) names.push(n.name);
    }
  }
  return names;
}

/** Inline project-local required namespaces into `forms`. No-op without `:require`. */
export function linkModules(forms: Form[], load: NsLoader, features: string[]): Form[] {
  const seen = new Set<string>();
  const owner = new Map<string, string>();
  const linked: Form[] = [];

  const visit = (fs: Form[], label: string, isRoot: boolean): void => {
    const nsIdx = fs.findIndex(isNsForm);
    const body: Form[] = [];
    const aliases = new Map<string, true>();
    if (nsIdx >= 0) {
      const specs = requireSpecs(fs[nsIdx]!);
      for (const s of specs) {
        aliases.set(s.ns, true);
        if (s.alias) aliases.set(s.alias, true);
        if (seen.has(s.ns)) continue;
        seen.add(s.ns);
        const dep = load(s.ns);
        if (!dep) throw new LinkError(`namespace ${s.ns} (required by ${label}) not found in the project sources`);
        visit(readAllStr(dep.source, features), s.ns, false);
      }
      const { stripped } = splitNs(fs[nsIdx]!);
      if (isRoot) body.push(stripped);
    }
    fs.forEach((f, i) => {
      if (i === nsIdx) return;
      body.push(aliases.size ? rewrite(f, aliases) : f);
    });
    for (const n of topLevelNames(body)) {
      const prev = owner.get(n);
      if (prev !== undefined && prev !== label) {
        throw new LinkError(`name collision: ${n} is defined in both ${prev} and ${label} (AS modules are flattened)`);
      }
      owner.set(n, label);
    }
    linked.push(...body);
  };

  const rootNs = forms.find(isNsForm);
  visit(forms, rootNs ? splitNs(rootNs).ns || '<main>' : '<main>', true);
  return linked;
}
