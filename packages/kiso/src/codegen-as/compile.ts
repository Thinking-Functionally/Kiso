// AS backend entry point. Called from api/compiler.ts when target === 'as'.

import type { Form } from '../reader/form.js';
import type { Node } from '../analyzer/node.js';
import { CompileError } from '../api/errors.js';
import { checkEntries, collectExports } from './collect-exports.js';
import { lowerModule, AsUnsupportedError } from './lower.js';
import { emitAs } from './emitter-as.js';

export type AsCompileInput = {
  forms: Form[];
  nodes: Node[];
  filename?: string;
  exports?: string[];
  worker?: string;
};

export function compileAs(input: AsCompileInput): { code: string } {
  const { forms, nodes, filename, exports, worker } = input;

  if (exports && exports.length > 0) {
    try {
      checkEntries(forms, exports);
    } catch (err) {
      throw new CompileError(err instanceof Error ? err.message : String(err), 'codegen', filename);
    }
  }

  try {
    const mod = lowerModule(nodes);
    const names = [...new Set([...collectExports(forms).map((e) => e.name), ...(exports ?? [])])];
    return { code: emitAs(mod, { exports: names, worker }) };
  } catch (err) {
    if (err instanceof AsUnsupportedError) {
      const form = forms[err.nodeIndex];
      throw new CompileError(err.message, 'codegen', filename, form?.line, form?.col);
    }
    throw err;
  }
}
