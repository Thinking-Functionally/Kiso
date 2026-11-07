// clojure.edn / read-string — turns reader forms into runtime data (no evaluation).

import { readStr } from '../reader/reader.js';
import type { Form } from '../reader/form.js';
import { vector } from './vector.js';
import { listOf } from './list.js';
import { hashMap } from './hash-map.js';
import { hashSet } from './hash-set.js';
import { keyword } from './keyword.js';
import { symbol } from './symbol.js';

function toData(f: Form): unknown {
  const d = f.data;
  switch (d.type) {
    case 'nil': return null;
    case 'boolean': case 'integer': case 'float': case 'string': return d.value;
    case 'bigint': return d.value;
    case 'char': return d.value;
    case 'keyword': return d.ns ? keyword(d.name, d.ns) : keyword(d.name);
    case 'symbol': return d.ns ? symbol(d.ns, d.name) : symbol(d.name);
    case 'list': return listOf(d.items.map(toData));
    case 'vector': return vector(...d.items.map(toData));
    case 'set': return hashSet(...d.items.map(toData));
    case 'map': return hashMap(...d.items.map(toData));
    case 'regex': return new RegExp(d.pattern);
    case 'ratio': return parseInt(d.numerator) / parseInt(d.denominator);
    case 'tagged': return toData(d.form);
  }
}

export function read_string(s: string): unknown {
  const form = readStr(s);
  return form === null ? null : toData(form);
}
