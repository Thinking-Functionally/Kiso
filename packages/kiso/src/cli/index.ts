import { parseArgs } from './args.js';
import { compileCommand } from './compile-command.js';
import { buildCommand, runCommand, serveCommand } from './build-command.js';
import { version } from '../version.js';

const HELP_TEXT = `Usage: kiso <command> [options]

Commands:
  compile <file|dir...>   Compile .cljs files (JavaScript by default)
  build <file>            Compile one .cljs file to WebAssembly (needs assemblyscript)
  serve <file>            Serve a --worker style handler over HTTP on Node (--port, default 8787)
  run <file> [-- args]    Build to WebAssembly and run -main on Node

Options:
  --source-map            Generate sidecar .js.map files
  --inline-source-map     Embed source map as base64 in .js
  --out-dir <dir>         Write output to <dir>
  --target <js|as>        Backend: js (default) or as (AssemblyScript, experimental)
  --export <name>         (as) Require entry point <name>; repeatable
  -o, --out <file>        (build) Output .wasm path
  --worker                (build) Serverless: emit <name>.wasm + worker.js (Cloudflare Workers)
  --handler <name>        (build --worker) Request handler def (default: handle)
  --runtime <gc>          (build/run) minimal (default), stub or incremental
  -V, --version           Show version
  -h, --help              Show this help

Examples:
  kiso compile src/app/core.cljs
  kiso compile src/
  kiso compile --source-map src/
  kiso compile --out-dir dist/ src/
  kiso build app.cljs -o app.wasm
  kiso build api.cljs --worker --out-dir dist/
  kiso run app.cljs -- arg1 arg2
`;

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  switch (args.command) {
    case 'help':
      process.stdout.write(HELP_TEXT);
      break;
    case 'version':
      process.stdout.write(`kiso ${version}\n`);
      break;
    case 'compile': {
      const result = compileCommand(args);
      if (result.errors > 0) {
        process.exitCode = 1;
      }
      break;
    }
    case 'build':
      await buildCommand(args);
      break;
    case 'serve':
      await serveCommand(args);
      break;
    case 'run':
      process.exitCode = await runCommand(args);
      break;
  }
}

main(process.argv.slice(2)).catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`kiso: ${msg}\n`);
  process.exitCode = 1;
});
