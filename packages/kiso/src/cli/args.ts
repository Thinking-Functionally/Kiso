import { parseArgs as nodeParseArgs } from 'node:util';
import type { GcRuntime } from '../codegen-as/build.js';

export type CliArgs =
  | { command: 'help' }
  | { command: 'version' }
  | {
      command: 'compile';
      targets: string[];
      sourceMap: boolean;
      inlineSourceMap: boolean;
      outDir: string | null;
      target: 'js' | 'as';
      exports: string[];
    }
  | { command: 'build'; file: string; outFile: string | null; runtime: GcRuntime; exports: string[] }
  | { command: 'run'; file: string; runtime: GcRuntime; exports: string[]; programArgs: string[] };

export function parseArgs(argv: string[]): CliArgs {
  const sep = argv.indexOf('--');
  const programArgs = sep >= 0 ? argv.slice(sep + 1) : [];
  const { values, positionals } = nodeParseArgs({
    args: sep >= 0 ? argv.slice(0, sep) : argv,
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'V', default: false },
      'source-map': { type: 'boolean', default: false },
      'inline-source-map': { type: 'boolean', default: false },
      'out-dir': { type: 'string' },
      target: { type: 'string' },
      export: { type: 'string', multiple: true },
      out: { type: 'string', short: 'o' },
      runtime: { type: 'string' },
    },
  });

  if (values.help) return { command: 'help' };
  if (values.version) return { command: 'version' };

  const command = positionals[0];
  if (!command) return { command: 'help' };

  if (command === 'build' || command === 'run') {
    const file = positionals[1];
    if (!file || positionals.length > 2) throw new Error(`${command} requires exactly one .cljs file`);
    const runtime = (values.runtime as string | undefined) ?? 'minimal';
    if (runtime !== 'minimal' && runtime !== 'stub' && runtime !== 'incremental') {
      throw new Error(`Unknown --runtime: ${runtime} (expected minimal, stub or incremental)`);
    }
    const exports = (values.export as string[] | undefined) ?? [];
    return command === 'build'
      ? { command, file, outFile: (values.out as string | undefined) ?? null, runtime, exports }
      : { command, file, runtime, exports, programArgs };
  }

  if (command !== 'compile') {
    throw new Error(`Unknown command: ${command}`);
  }

  const targets = positionals.slice(1);
  if (targets.length === 0) {
    throw new Error('compile requires at least one file or directory target');
  }

  const sourceMap = Boolean(values['source-map']);
  const inlineSourceMap = Boolean(values['inline-source-map']);

  if (sourceMap && inlineSourceMap) {
    throw new Error('--source-map and --inline-source-map are mutually exclusive');
  }

  const targetOpt = (values.target as string | undefined) ?? 'js';
  if (targetOpt !== 'js' && targetOpt !== 'as') {
    throw new Error(`Unknown --target: ${targetOpt} (expected js or as)`);
  }
  const target: 'js' | 'as' = targetOpt;

  return {
    command: 'compile',
    targets,
    sourceMap,
    inlineSourceMap,
    outDir: (values['out-dir'] as string) ?? null,
    target,
    exports: (values.export as string[] | undefined) ?? [],
  };
}
