import { instantiateCore, ExitSignal } from './core.js';

type Env = Record<string, unknown>;

export type WorkerOptions = {
  /** Name of the wasm export that handles a request (default `kiso_handle`). */
  entry?: string;
};

/**
 * Build a fetch-style handler (Cloudflare Workers / any WinterCG runtime) from a compiled Kiso module.
 * A fresh instance serves each request, so memory never accumulates across requests.
 */
export function createWorker(module: WebAssembly.Module, opts: WorkerOptions = {}) {
  const entry = opts.entry ?? 'kiso_handle';
  return {
    async fetch(request: Request, env: Env = {}): Promise<Response> {
      const url = new URL(request.url);
      const headers: Record<string, string> = {};
      request.headers.forEach((v, k) => (headers[k] = v));
      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => (query[k] = v));
      const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
      const reqJson = JSON.stringify({
        method: request.method,
        url: request.url,
        path: url.pathname,
        query,
        headers,
        body,
      });

      const stringEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(env)) if (typeof v === 'string') stringEnv[k] = v;

      let log = '';
      const inst = await instantiateCore(module, { env: stringEnv, write: (s) => void (log += s), now: Date.now });
      if (typeof inst.exports[entry] !== 'function') return new Response(`module has no ${entry} export`, { status: 500 });
      try {
        return toResponse(inst.callString(entry, reqJson));
      } catch (e) {
        if (e instanceof ExitSignal) return new Response('exit', { status: 500 });
        return new Response(`kiso error: ${(e as Error).message}`, { status: 500 });
      }
    },
  };
}

function toResponse(json: string): Response {
  const r = JSON.parse(json) as { status?: number; headers?: Record<string, unknown>; body?: unknown };
  const headers = new Headers();
  for (const [k, v] of Object.entries(r.headers ?? {})) headers.set(k, String(v));
  let body: string;
  if (typeof r.body === 'string') body = r.body;
  else if (r.body === undefined || r.body === null) body = '';
  else {
    body = JSON.stringify(r.body);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  }
  return new Response(body, { status: typeof r.status === 'number' ? r.status : 200, headers });
}
