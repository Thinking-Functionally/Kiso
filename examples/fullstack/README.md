# fullstack

One `.cljc` namespace (`app.shared`) used by the browser (JS backend) and a wasm API (AssemblyScript backend).

    kiso serve src/app/api.cljs --port 8787
    curl -X POST localhost:8787/api/todos -d '{"title":"milk"}'
    kiso build src/app/api.cljs --worker --out-dir dist   # Cloudflare Workers
    kiso compile src/app/client.cljs                      # browser JS

`#?(:as … :cljs …)` picks per backend. AS links project-local `:require`s by inlining them (top-level names must be unique).

## Serverless

`kiso build … --worker` emits `worker.js` + the wasm module. Handlers may be plain functions or return a `go` block that awaits `host/fetch`.
The Cloudflare path is covered by `packages/kiso/test/serverless/miniflare.test.ts`, which runs the worker inside workerd.
