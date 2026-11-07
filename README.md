# Kiso

[![CI](https://github.com/clojurewasm/Kiso/actions/workflows/ci.yml/badge.svg)](https://github.com/clojurewasm/Kiso/actions/workflows/ci.yml)
[![npm kiso](https://img.shields.io/npm/v/@clojurewasm/kiso.svg?label=@clojurewasm/kiso)](https://www.npmjs.com/package/@clojurewasm/kiso)
[![npm su](https://img.shields.io/npm/v/@clojurewasm/su.svg?label=@clojurewasm/su)](https://www.npmjs.com/package/@clojurewasm/su)
[![license](https://img.shields.io/github/license/clojurewasm/Kiso)](https://github.com/clojurewasm/Kiso/blob/main/LICENSE)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/chaploud?logo=githubsponsors&logoColor=white&color=ea4aaa)](https://github.com/sponsors/chaploud)

A ClojureScript compiler written in TypeScript with two backends: JavaScript and (experimental) AssemblyScript/WebAssembly. Zero dependencies.

**Kiso** (基礎) — *foundation* in Japanese.

| Package             | Description              | Size    |
|---------------------|--------------------------|---------|
| `@clojurewasm/kiso` | Compiler + runtime       | ~146 KB |
| `@clojurewasm/su`   | Component framework      | ~21 KB  |

**[Live Showcase](https://clojurewasm.github.io/Kiso/)** — interactive demos with source code and compiled JS output.

## Quick Start

```bash
npm install @clojurewasm/kiso @clojurewasm/su
npm install -D vite
```

**vite.config.js:**

```js
import { cljs } from '@clojurewasm/kiso/vite';
export default { plugins: [cljs()] };
```

**src/main.cljs:**

```clojure
(ns my.app
  (:require [su.core :as su :refer [defc defstyle]]))

(defstyle app-styles
  [:.counter {:display "flex" :gap "8px" :align-items "center"}])

(defc my-counter
  {:style [app-styles]}
  []
  (let [n (atom 0)]
    [:div.counter
     [:button {:on-click (fn [_] (swap! n dec))} "-"]
     [:span (str @n)]
     [:button {:on-click (fn [_] (swap! n inc))} "+"]]))

(su/mount (js/document.getElementById "app") [::my-counter])
```

```bash
npx vite
```

## What Compiles to What?

```clojure
(defn greet [name]           ;; → export let greet = function greet(name) {
  (str "Hello, " name "!"))  ;;     return str("Hello, ", name, "!");  };

(ns my.app                   ;; → import * as u from './util.js';
  (:require [my.util :as u]))

(.toUpperCase "hello")       ;; → "hello".toUpperCase()
(.-length "hello")           ;; → "hello".length
(js/console.log "hi")        ;; → console.log("hi")

[1 2 3]                      ;; → vector(1, 2, 3)
{:a 1}                       ;; → hashMap(keyword("a"), 1)
```

## Backends: JavaScript and AssemblyScript (experimental)

Kiso has two code generators that share the reader, macros and analyzer. Pick one per program with `--target`.

| | `js` (default) | `as` (AssemblyScript → WebAssembly) |
|---|---|---|
| Runs in | browsers, Node, Bun, Deno | Node/Bun CLI, Cloudflare Workers / workerd, any wasm host |
| Output | ES modules | one `.wasm` (~30 KB for small programs) |
| JS interop (`js/`, `.method`) | yes | no, use `host/` functions |
| `try`/`catch`, `eval` | yes / no | no (`ex-info` traps; the host reports it) |
| Regex | JS `RegExp` | in-wasm engine (no lookaround, backreferences or named groups) |
| Speed | best for collection/string work | best for numeric and call-heavy code; see `packages/kiso/bench` |

Use **JS** for anything that touches the DOM or the JS ecosystem (the `su` framework, Vite apps).
Use **AS** for CLIs and serverless handlers where a small, sandboxed, portable artifact matters.
Shared `.cljc` code (reader conditionals `:as` / `:cljs`) can run on both: `test/kiso/*_test.cljs` runs every
test on both backends.

```bash
npx kiso build app.cljs -o app.wasm          # needs `assemblyscript` installed
npx kiso run app.cljs -- arg1 arg2           # build + run -main on Node (host/args, host/env, host/fetch …)
npx kiso build handler.cljs --worker         # app.wasm + worker.js for Cloudflare Workers
npx kiso serve handler.cljs --port 8787      # same handler over HTTP on Node
```

The `host/` namespace is the wasm module's only door to the outside world: `host/args`, `env`, `read-file`,
`write-file`, `stdin`, `exit`, `now`, `fetch` (async, usable in go blocks), `json-parse` and `json-stringify`
(the JSON functions also work on the JS backend). Examples: [`examples/cli-todo`](examples/cli-todo/) (CLI) and
[`examples/fullstack`](examples/fullstack/) (shared code, wasm API, JS client). Design notes and the exact supported
subset: [`.dev/design/08-assemblyscript-backend.md`](.dev/design/08-assemblyscript-backend.md).

## Compiler API

```ts
import { compile } from '@clojurewasm/kiso/compiler';
const { code } = compile('(defn add [a b] (+ a b))');
```

```bash
npx kiso compile src/ --out-dir dist/ --source-map
```

## Documentation

See [docs/](docs/README.md) for the full guide, API reference, and cookbook.

## Examples

- [Task Manager](examples/task-manager/) — full app with components, context, and styling
- [CLI todo](examples/cli-todo/) — command-line app on the AssemblyScript backend
- [Full-stack](examples/fullstack/) — shared `.cljc`, wasm API (Node or Cloudflare Workers) and a JS client

## Development

```bash
npm install && npm run build
npm test                     # 1500+ vitest + Playwright E2E
npm run typecheck
```

## License

[MIT](LICENSE)
