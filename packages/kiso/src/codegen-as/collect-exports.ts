// Collects exports from the original Form[] (before macro expansion).
// Analyzer.analyzeDef discards metadata, so ^:export is only visible here (D16).

import type { Form } from '../reader/form.js';

export type ExportInfo = { name: string; line: number; col: number };

const DEF_HEADS = new Set(['def', 'defn', 'defn-']);

type DefInfo = { name: string; exported: boolean; line: number; col: number };

function parseDef(form: Form): DefInfo | null {
  if (form.data.type !== 'list' || form.data.items.length < 2) return null;
  const [head, target] = form.data.items;
  if (head!.data.type !== 'symbol' || head!.data.ns || !DEF_HEADS.has(head!.data.name)) return null;

  let sym = target!;
  let exported = false;
  if (sym.data.type === 'list' && sym.data.items.length === 3) {
    const [w, inner, meta] = sym.data.items;
    if (w!.data.type === 'symbol' && w!.data.name === 'with-meta' && meta!.data.type === 'map') {
      exported = hasTruthyExport(meta!.data.items);
      sym = inner!;
    }
  }
  if (sym.data.type !== 'symbol') return null;
  return { name: sym.data.name, exported, line: form.line, col: form.col };
}

function hasTruthyExport(items: Form[]): boolean {
  for (let i = 0; i + 1 < items.length; i += 2) {
    const k = items[i]!.data;
    const v = items[i + 1]!.data;
    if (k.type === 'keyword' && k.ns === null && k.name === 'export') {
      return !(v.type === 'nil' || (v.type === 'boolean' && !v.value));
    }
  }
  return false;
}

/** Exports marked ^:export, plus `-main` when defined (CLI default entry). */
export function collectExports(forms: Form[]): ExportInfo[] {
  const out: ExportInfo[] = [];
  const seen = new Set<string>();
  for (const f of forms) {
    const d = parseDef(f);
    if (!d || seen.has(d.name)) continue;
    if (d.exported || d.name === '-main') {
      seen.add(d.name);
      out.push({ name: d.name, line: d.line, col: d.col });
    }
  }
  return out;
}

export function listDefs(forms: Form[]): string[] {
  return forms.map(parseDef).filter((d): d is DefInfo => d !== null).map((d) => d.name);
}

/** Throws if a required entry point is not defined; message lists available defs. */
export function checkEntries(forms: Form[], required: string[]): void {
  const defs = listDefs(forms);
  const missing = required.filter((r) => !defs.includes(r));
  if (missing.length > 0) {
    throw new Error(
      `Missing entry point(s): ${missing.join(', ')}. Available defs: ${defs.length ? defs.join(', ') : '(none)'}`,
    );
  }
}
