import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { compile } from '../api/compiler.js';
import { buildWasm, type GcRuntime } from '../codegen-as/build.js';
import { instantiateKiso } from '../host/node.js';
import { createWorker } from '../host/worker.js';
import type { NsLoader } from '../codegen-as/modules.js';

type Common = { file: string; runtime?: GcRuntime | undefined; exports: string[]; wasm?: Record<string, string> };

function readWasm(map: Record<string, string> | undefined): Record<string, Uint8Array> {
  return Object.fromEntries(Object.entries(map ?? {}).map(([name, path]) => [name, new Uint8Array(readFileSync(path))]));
}

/** Find `a/b/c.{cljc,cljs}` for ns `a.b.c` in the entry file's directory, its ancestors, or their `src/`. */
function fileLoader(entry: string): NsLoader {
  return (ns) => {
    const rel = ns.replace(/-/g, '_').split('.').join('/');
    for (let dir = dirname(resolve(entry)); ; dir = dirname(dir)) {
      for (const root of [dir, join(dir, 'src')]) {
        for (const ext of ['.cljc', '.cljs']) {
          for (const r of [rel, ns.split('.').join('/')]) {
            const p = join(root, r + ext);
            if (existsSync(p) && resolve(p) !== resolve(entry)) return { source: readFileSync(p, 'utf-8'), filename: p };
          }
        }
      }
      if (dirname(dir) === dir) return null;
    }
  };
}

async function toWasm({ file, runtime, exports }: Common, worker?: string): Promise<Uint8Array> {
  const source = readFileSync(file, 'utf-8');
  const { code } = compile(source, { filename: basename(file), target: 'as', exports, worker, loadNs: fileLoader(file) });
  return buildWasm(code, runtime ? { runtime } : {});
}

/** `kiso build <file.cljs>`: Kiso -> AssemblyScript -> .wasm. Returns the output path. */
export async function buildCommand(
  o: Common & { outFile: string | null; worker?: string | null; outDir?: string | null },
): Promise<string> {
  const bytes = await toWasm(o, o.worker ?? undefined);
  const wasmName = basename(o.file).replace(/\.clj[sc]$/, '.wasm');
  const dir = o.outDir ?? dirname(o.file);
  const out = o.outFile ?? join(dir, wasmName);
  mkdirSync(dirname(out), { recursive: true });
  if (o.worker) {
    const entry = join(dirname(out), 'worker.js');
    const linked = Object.entries(readWasm(o.wasm)).map(([name, data]) => {
      const file = `${name}.ffi.wasm`;
      writeFileSync(join(dirname(out), file), data);
      return [name, file] as const;
    });
    writeFileSync(entry, workerEntrySource(basename(out), linked));
    process.stderr.write(`wrote ${relative(process.cwd(), entry)}\n`);
  }
  writeFileSync(out, bytes);
  process.stderr.write(`built ${relative(process.cwd(), o.file)} -> ${relative(process.cwd(), out)} (${bytes.length} bytes)\n`);
  return out;
}

/** `kiso run <file.cljs>`: build in memory and run `-main` on the Node host, awaiting `host/fetch`. Returns the exit code. */
export async function runCommand(o: Common & { programArgs: string[] }): Promise<number> {
  const bytes = await toWasm(o);
  const inst = await instantiateKiso(bytes, { args: o.programArgs, wasm: readWasm(o.wasm) });
  return inst.runMainAsync();
}

function workerEntrySource(wasmFile: string, linked: (readonly [string, string])[]): string {
  const imports = linked.map(([, file], i) => `import ffi${i} from './${file}';\n`).join('');
  const opts = linked.length ? `, { wasm: { ${linked.map(([name], i) => `${JSON.stringify(name)}: ffi${i}`).join(', ')} } }` : '';
  return `import wasm from './${wasmFile}';
${imports}import { createWorker } from '@clojurewasm/kiso/host/worker';

export default createWorker(wasm${opts});
`;
}

/** `kiso serve <file.cljs>`: build the handler and serve it over HTTP on Node (local dev for --worker apps). */
export async function serveCommand(o: Common & { handler: string; port: number }): Promise<void> {
  const bytes = await toWasm(o, o.handler);
  const linked = Object.fromEntries(
    await Promise.all(Object.entries(readWasm(o.wasm)).map(async ([name, data]) => [name, await WebAssembly.compile(data as BufferSource)] as const)),
  );
  const worker = createWorker(await WebAssembly.compile(bytes as BufferSource), { wasm: linked });
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const hasBody = body && req.method !== 'GET' && req.method !== 'HEAD';
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      const r = await worker.fetch(
        new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers, body: hasBody ? body : undefined }),
        process.env as Record<string, string>,
      );
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(500).end(String((e as Error).message));
    }
  });
  await new Promise<void>((ok) => server.listen(o.port, ok));
  process.stderr.write(`kiso serve: http://localhost:${o.port}\n`);
}
