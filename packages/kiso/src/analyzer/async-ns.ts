// clojure.core.async is built in: `<!`, `>!`, `go`, `chan`... are core names.
// Drop its :require spec and rewrite `alias/name` symbols to bare names.

import type { Form } from '../reader/form.js';
import { setAsyncMacros } from './macros.js';

const ASYNC_NS = new Set(['clojure.core.async', 'cljs.core.async']);

function sym(f: Form | undefined): { ns: string | null; name: string } | null {
  return f && f.data.type === 'symbol' ? f.data : null;
}

function kw(f: Form | undefined): string | null {
  return f && f.data.type === 'keyword' ? f.data.name : null;
}

function collectAliases(items: Form[], aliases: Set<string>): Form[] {
  const out: Form[] = [];
  for (const clause of items) {
    if (clause.data.type !== 'list' || kw(clause.data.items[0]) !== 'require') {
      out.push(clause);
      continue;
    }
    const kept: Form[] = [clause.data.items[0]!];
    for (const spec of clause.data.items.slice(1)) {
      const parts = spec.data.type === 'vector' ? spec.data.items : null;
      const head = parts ? sym(parts[0]) : sym(spec);
      if (head && !head.ns && ASYNC_NS.has(head.name)) {
        aliases.add(head.name);
        if (parts) {
          for (let i = 1; i < parts.length - 1; i++) {
            const alias = kw(parts[i]) === 'as' ? sym(parts[i + 1]) : null;
            if (alias) aliases.add(alias.name);
          }
        }
        continue;
      }
      kept.push(spec);
    }
    if (kept.length > 1) out.push({ ...clause, data: { type: 'list', items: kept } });
  }
  return out;
}

function rewrite(f: Form, aliases: Set<string>): Form {
  const d = f.data;
  switch (d.type) {
    case 'symbol':
      return d.ns && aliases.has(d.ns) ? { ...f, data: { type: 'symbol', ns: null, name: d.name } } : f;
    case 'list':
    case 'vector':
    case 'map':
    case 'set':
      return { ...f, data: { ...d, items: d.items.map((x) => rewrite(x, aliases)) } };
    case 'tagged':
      return { ...f, data: { ...d, form: rewrite(d.form, aliases) } };
    default:
      return f;
  }
}

export function resolveAsyncNs(forms: Form[]): Form[] {
  const aliases = new Set<string>();
  const first = forms[0];
  let out = forms;
  if (first && first.data.type === 'list' && sym(first.data.items[0])?.name === 'ns') {
    const [head, name, ...rest] = first.data.items;
    const nsForm: Form = { ...first, data: { type: 'list', items: [head!, name!, ...collectAliases(rest, aliases)] } };
    out = [nsForm, ...forms.slice(1)];
  }
  setAsyncMacros(aliases.size > 0);
  if (aliases.size === 0) return out;
  return out.map((f) => rewrite(f, aliases));
}
