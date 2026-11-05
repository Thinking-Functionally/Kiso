# fullstack

One `.cljc` namespace (`app.shared`) used by the browser (JS backend) and a wasm API (AssemblyScript backend).

    kiso serve src/app/api.cljs --port 8787
    curl -X POST localhost:8787/api/todos -d '{"title":"milk"}'
    kiso build src/app/api.cljs --worker --out-dir dist   # Cloudflare Workers
    kiso compile src/app/client.cljs                      # browser JS

`#?(:as … :cljs …)` picks per backend. AS links project-local `:require`s by inlining them (top-level names must be unique).
