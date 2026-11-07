# @clojurewasm/kiso

[![npm version](https://img.shields.io/npm/v/@clojurewasm/kiso.svg)](https://www.npmjs.com/package/@clojurewasm/kiso)
[![license](https://img.shields.io/npm/l/@clojurewasm/kiso.svg)](https://github.com/clojurewasm/Kiso/blob/main/LICENSE)

ClojureScript-to-JavaScript compiler written in TypeScript. Zero dependencies.

**Kiso** (基礎) — *foundation* in Japanese.

**[Live Showcase](https://clojurewasm.github.io/Kiso/)** | **[Documentation](https://github.com/clojurewasm/Kiso/tree/main/docs)**

## Features

- **Full ClojureScript** — reader, analyzer, codegen for the complete language
- **Zero dependencies** — pure TypeScript, nothing to install beyond this package
- **Vite plugin** — compile `.cljs` files with HMR and source maps
- **Tree-shakeable runtime** — persistent data structures, only import what you use
- **~146 KB** package size
- **330 vars** in `cljs.core` (100% of target coverage)

## Install

```bash
npm install @clojurewasm/kiso
```

## Quick Start

### With Vite

```bash
npm install @clojurewasm/kiso @clojurewasm/su -D vite
```

```js
// vite.config.js
import { cljs } from '@clojurewasm/kiso/vite';
export default { plugins: [cljs()] };
```

```clojure
;; src/main.cljs
(ns my.app)
(defn greet [name] (str "Hello, " name "!"))
(js/console.log (greet "World"))
```

```bash
npx vite
```

### Compiler API

```ts
import { compile } from '@clojurewasm/kiso/compiler';
const { code } = compile('(defn add [a b] (+ a b))');
```

### CLI

```bash
npx kiso compile src/ --out-dir dist/ --source-map
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
| Speed | best for collection/string work | best for numeric and call-heavy code; see `bench/` |

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
(the JSON functions also work on the JS backend). Examples: [`examples/cli-todo`](../../examples/cli-todo/) (CLI) and
[`examples/fullstack`](../../examples/fullstack/) (shared code, wasm API, JS client). Design notes and the exact supported
subset: [`.dev/design/08-assemblyscript-backend.md`](../../.dev/design/08-assemblyscript-backend.md).

## What Compiles to What?

```clojure
(defn greet [name]           ;; → export let greet = function greet(name) {
  (str "Hello, " name "!"))  ;;     return str("Hello, ", name, "!");  };

(.toUpperCase "hello")       ;; → "hello".toUpperCase()
(.-length "hello")           ;; → "hello".length
(js/console.log "hi")        ;; → console.log("hi")

[1 2 3]                      ;; → vector(1, 2, 3)
{:a 1}                       ;; → hashMap(keyword("a"), 1)
```

## Exports

| Subpath      | Description                    |
|--------------|--------------------------------|
| `.`          | `CompileError`, `version`      |
| `./compiler` | `compile`, `read`, `analyze`   |
| `./vite`     | Vite plugin (`cljs()`)         |
| `./runtime`  | Persistent data structures     |
| `./codegen`  | Codegen hooks for libraries    |

## License

[MIT](https://github.com/clojurewasm/Kiso/blob/main/LICENSE)
