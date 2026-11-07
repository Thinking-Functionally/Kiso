# Kiso Development Tracker

## Architectural Decisions

### D1: Full TypeScript Implementation

**Date**: 2026-03-03

Implement the entire ClojureScript compiler in TypeScript with zero native dependencies.
Port knowledge and algorithms from ClojureWasm (Zig), not code.

**Rationale**: npm install simplicity, single-language debugging, TS developer accessibility.
CW's real asset is the knowledge gained from implementing Clojure, not the Zig code itself.

**Affected**: Entire project architecture.

### D2: Self-Implemented Macro Evaluator (No SCI)

**Date**: 2026-03-03

Use a self-implemented mini evaluator for defmacro expansion instead of SCI dependency.
~40 core macros as TypeScript Form→Form functions. Mini evaluator with ~30 built-in functions.

**Rationale**: Zero dependencies, full control, CW TreeWalk knowledge directly applicable.
99% of macros need only ~30 functions. SCI can be added later as optional fallback.

**Affected**: `packages/kiso/src/analyzer/macros.ts`, `packages/kiso/src/analyzer/evaluator.ts`.

### D3: Package Structure

**Date**: 2026-03-03 (updated 2026-03-04)

npm workspaces monorepo with two packages:
- `packages/kiso/` → `@clojurewasm/kiso` — compiler + runtime
- `packages/su/` → `@clojurewasm/su` — Web Components framework (depends on @clojurewasm/kiso)

TypeScript project references: `@clojurewasm/su` references `@clojurewasm/kiso` (composite).
Scoped packages (`@clojurewasm/*`) to avoid npm name conflicts.

**Affected**: root `package.json` (workspaces), `tsconfig.base.json`, per-package configs.

### D4: Reader Token-Level Design

**Date**: 2026-03-03

nil/true/false are tokenized as `symbol` kind (not separate token kinds like CW).
Discrimination happens in the Reader (`readSymbol`). This keeps the tokenizer simpler
and avoids redundant token kinds that duplicate the symbol reading path.

Column tracking is 1-indexed (matching the Form `col` field), differing from CW's 0-based.

Syntax-quote deferred to Phase 5: requires namespace resolution context which the
analyzer will provide. Current `backtick` token emits `(syntax-quote x)` wrapper form.

### D5: Runtime Data Structures

**Date**: 2026-03-03

- PersistentVector: 32-way bit-partitioned trie with tail optimization (CW algorithm)
- PersistentHashMap: HAMT with bitmap+popcount, BitmapIndexedNode + CollisionNode
- PersistentHashSet: thin wrapper over PersistentHashMap
- PersistentList: cons-cell linked list (simpler than CW's array-backed)
- Keyword: interned (global Map). Symbol: not interned.
- Hash: Murmur3 finalizer for collections, polynomial string hash, CW seeds.
- Atom: simple mutable container (single-threaded JS, no CAS needed).

**Deferred**: Seq abstraction (ISeq/LazySeq), Protocol system (Symbol-based dispatch),
Transient collections. These will be added when needed by the compiler pipeline.

**Affected**: `packages/kiso/src/runtime/`.

### D6: Language Scope — Full ClojureScript (minus Google Closure)

**Date**: 2026-03-04

Kiso targets full ClojureScript language compatibility. NOT a minimal subset.

**In scope**:
- Full Reader (all reader macros, syntax-quote, namespaced maps)
- All ~40 core macros + defmacro via mini evaluator
- All special forms (~20: def, fn*, let*, do, if, loop*, recur, try, throw, new,
  `.`, set!, var, js*, ns, deftype*, defrecord*, letfn*, case*)
- Full Protocol system (defprotocol, deftype, defrecord, extend-type, reify)
- Full JS interop (.method, Ctor., .-field, js*, set!)
- Persistent data structures (Vector, HashMap, HashSet, List, LazySeq)
- Destructuring (sequential + associative, all modifiers)
- Multimethods (defmulti, defmethod)
- cljs.core as .cljs macro definitions (via mini evaluator)

**Intentionally excluded**:
- Google Closure Compiler dependency (no goog.* namespace)
- `:advanced` optimization (delegated to Vite/esbuild/Rollup)
- JVM Clojure host interop (ns :import of Java classes)
- cljs.spec (may add later as optional)
- core.async (may add later as optional)
- Reader conditional `:clj` target (only `:cljs` and `:default`)

**Rationale**: The goal is a practical ClojureScript compiler for modern web development.
Replacing Google Closure with Vite removes the biggest pain point of upstream CLJS
while keeping full language semantics. "Minimal subset" would limit adoption.

**Affected**: All modules — this sets the scope ceiling for the entire project.

### D7: Protocol Dispatch — JS Symbol Keys (Not CW-style Map Lookup)

**Date**: 2026-03-04

CW dispatches protocol methods via string-keyed map lookup (`valueTypeKey → impls map`).
Kiso uses **JS Symbol-keyed methods on prototypes** instead.

```typescript
const ISeq = defprotocol('ISeq', ['first', 'rest']);
// Dispatch: obj[ISeq.methods.first]() — native JS property lookup
```

**Rationale**:
- Leverages JS engine's optimized property lookup (hidden classes, inline caches)
- No need for custom inline cache or generation counter (CW complexity)
- Symbol keys avoid name collisions without mangling
- extend-type becomes `Proto.prototype[sym] = fn` (native JS pattern)
- deftype/defrecord become ES6 classes with `[sym]()` methods
- reify becomes object literal with `[sym]()` methods

**Trade-off**: Primitive types (string, number, nil) cannot have Symbol methods added
to their prototypes safely. These use a fallback path in `protocolFn`.

**Design**: See `.dev/design/06-protocol-lazyseq.md` for full specification.

**Affected**: `packages/kiso/src/runtime/protocols.ts`, `packages/kiso/src/analyzer/`, `packages/kiso/src/codegen/emitter.ts`.

### D8: su Architecture — Web Components + Fine-Grained Signals (No VDOM)

**Date**: 2026-03-04

su compiles `defc` to Custom Elements with Shadow DOM. Fine-grained reactivity
(VanJS/Solid.js/solid-element pattern) drives updates inside the Shadow DOM.
No virtual DOM, no React dependency, no diffing engine.

**Core model**:
- `defc` → `customElements.define()` with Shadow DOM
- defc name IS the CE tag name (hyphen required, no forced prefix)
- Component function runs **once** in `connectedCallback` (solid-element pattern)
- Kiso `atom` = su's state primitive (extended with tracking hook)
- `effect()` / `bind()` = fine-grained DOM updates inside Shadow DOM
- `defstyle` → `adoptedStyleSheets` (Shadow DOM provides natural CSS scoping)
- Props = observed attributes → atom signals → reactive updates

**Hiccup component syntax**: Namespace-qualified keywords. "One way to do it."
- `[::my-counter {:initial 5}]` — same-ns component (:: = current ns)
- `[:app.ui/my-counter ...]` — cross-ns component (full qualification)
- `[:div ...]` — bare keyword = native HTML element

**Rationale** (from 12+ framework comparative research):
- solid-element proves signals work perfectly inside Custom Elements
- Shadow DOM provides natural CSS scoping — no class name hashing needed
- Custom Elements are web standards — interop with any framework or plain HTML
- adoptedStyleSheets share a single CSSStyleSheet across all instances
- Declarative Shadow DOM (Baseline 2024) enables SSR
- Fine-grained reactivity eliminates need for virtual DOM diffing
- Ns-qualified keywords enable clj-kondo/clojure-lsp integration (unlike bare keywords)

**Collision policy**: Same-compilation duplicate tag names → compile error.
Cross-package collisions are user's responsibility. Scoped Custom Element
Registries (Interop 2026) will solve this at the platform level.

**Trade-off**: Shadow DOM adds ~2KB overhead vs plain direct DOM.
Custom Element re-registration is not possible — HMR uses render function replacement.

**Design**: See `.dev/design/07-su-framework.md` for full specification.

**Affected**: `@clojurewasm/su` package (separate from `@clojurewasm/kiso`).
`@clojurewasm/kiso` impact: atom tracking hook (F1), watch unsubscribe (F2),
CE tag validation and hiccup ns-keyword resolution (F8) — see design doc.

### D9: Codegen Readability — Short Munging + Codegen Hooks

**Date**: 2026-03-04

Overhauled name munging and added codegen hooks API for human-readable JS output.

**Munging changes**:
- Standalone operators get English names: `+`→`add`, `*`→`multiply`, `=`→`eq`, etc.
- Special characters use short suffixes: `?`→`_p`, `!`→`_m`, `->`→`_to_`
- Earmuffs preserved: `*debug*`→`_debug_`
- Runtime import collision detection: `_rt_` prefix alias when user def shadows operator

**Codegen hooks API**: `codegenHooks` option in `CompileOptions` allows libraries to
register custom JS emitters for namespace-qualified invocations. Hooks intercept in
`emitInvoke` when the function is a var-ref matching a registered key.

**Rationale**: Generated JS should look like hand-written code. `_QMARK_`/`_BANG_`/`_STAR_`
are noisy and unreadable. Short suffixes (`_p`, `_m`) are conventional and scannable.
Codegen hooks enable su (and future libraries) to emit idiomatic JS instead of raw
runtime function calls.

**Affected**: `packages/kiso/src/codegen/emitter.ts`, `packages/kiso/src/api/compiler.ts`,
`packages/kiso/src/api/codegen-hooks.ts` (new), `packages/su/src/codegen-hooks.ts` (new).
See `docs/codegen-hooks.md` for API documentation.

### D10: State Management — Props Channeling + Context + DevTools

**Date**: 2026-03-04

Three features for cross-component state sharing in su:

**Props Channeling**: Non-primitive values (atoms, objects) on custom elements are set as
JS properties instead of HTML attributes (which stringify to `"[object Object]"`).
`richProps` config separates atom-type props from observed attributes. `defc` macro
routes `:atom` prop type to `richProps` array.

**Context API**: `provide(key, value)` and `useContext(key)` using `CustomEvent` with
`composed: true` to cross Shadow DOM boundaries. Follows Lit Context Protocol pattern.
Host element tracking via `setHost/getHost` in lifecycle.ts.

**DevTools Trace**: Optional `label` on atoms, `_globalOnChange` static hook on Atom class.
`enableTrace()` / `disableTrace()` in su/devtools.ts console-log state changes with
optional filter function.

**Rationale**: Global `(def x (atom ...))` is the only way to share atoms between components.
Props channeling enables ownership patterns. Context API avoids props drilling across
Shadow DOM. DevTools trace helps debug reactive state flows.

**Affected**: `packages/su/src/hiccup.ts`, `packages/su/src/component.ts`,
`packages/su/src/context.ts` (new), `packages/su/src/devtools.ts` (new),
`packages/su/src/lifecycle.ts`, `packages/kiso/src/runtime/atom.ts`,
`packages/kiso/src/analyzer/macros.ts`.

### D11: Explicit Style Binding for su Components

**Date**: 2026-03-04

**Decision**: `defstyle` emits `(def name (create-sheet ...))` instead of a bare side-effect call.
`defc` no longer auto-lookups stylesheets by component name. Styles must be explicitly passed
via `:style` option (single value or vector for composition). `global-style!` applies stylesheets
to `document.adoptedStyleSheets` for document-level styling.

**Rationale**: The original auto-lookup by name was implicit and un-Clojure-like. Making defstyle
a def allows stylesheets to be first-class values: composable, testable, and explicitly referenced.
The vector `:style [a b c]` pattern enables style composition across multiple sheets.

**Affected**: `packages/kiso/src/analyzer/macros.ts` (defstyle, defc),
`packages/su/src/css.ts` (globalStyle), `packages/su/src/index.ts` (exports).

### D12: defc Auto-Wrap for Reactivity

**Date**: 2026-03-05

**Decision**: The `defc` macro auto-wraps the final hiccup expression in `(fn* [] expr)` at
compile time. If the user already returns `fn` or `fn*` (Form-2), the macro detects it and
skips the wrap. The auto-wrap recurses through `let`/`let*`/`do` to find the actual final expression.

**Rationale**: The su framework uses a Solid.js-style reactivity model where the render function
runs once. Reactive updates only happen when `renderHiccup` detects a function child and wraps it
with `bind()` → `effect()`. Without auto-wrap, users must manually return `(fn [] hiccup)` for
any component that uses atoms — a DX footgun since `@atom` inline in hiccup naturally appears
to work but produces static text. Auto-wrap eliminates this footgun with zero breaking changes:
existing Form-2 components are detected and preserved.

**Affected**: `packages/kiso/src/analyzer/macros.ts` (`wrapFinalExpr`, `wrapInFn`, defc expansion).

### D13: AssemblyScript Backend — Additive, AST + Lowering Pass (No Full IR)

**Date**: 2026-11-05

**Decision**: Add an AS backend alongside the JS backend. Existing reader, analyzer, `Node` types,
`emitter.ts`, runtime and `su` are unchanged. The AS backend consumes `Node[]` and runs a new
lowering pass (`codegen-as/lower.ts`). No standalone IR until M2/M3 proves it necessary.
Only touch points: `target` option in `api/compiler.ts` and `--target` in the CLI.

**Rationale**: `emitter.ts` is a single-pass AST → string emitter relying on JS features (IIFE, native
closures, `arguments.length`) that AS lacks. A lowering pass handles flattening, closure conversion and tail
analysis without risking the JS backend.

**Affected**: `packages/kiso/src/codegen-as/` (new), `api/compiler.ts`, CLI. See `design/08-assemblyscript-backend.md`.

### D14: Lowered Nodes Live Outside `Node`

**Date**: 2026-11-05

**Decision**: AS-only nodes (`closure`, `fn-table`, `temp-let`, `loop-stmt`, `tail-recur`; later `box`/`unbox`,
`typed-literal`) are defined in `codegen-as/lowered.ts`, never in `analyzer/node.ts`.

**Rationale**: Keeps the analyzer/JS emitter contract and `CodegenHook` signatures untouched.

### D15: `set!` Split in AS Lowering

**Date**: 2026-11-05

**Decision**: AS accepts `set!` on a var (e.g. from `binding` expansion) and rejects `set!` on interop targets.

**Rationale**: `macros.ts` expands `binding` into `set!`; a blanket rejection would break supported code.

### D16: Exports via `^:export`, Collected from `Form[]`

**Date**: 2026-11-05

**Decision**: Exports use ClojureScript's `^:export`; `-main` is the default CLI entry; `:exports` config
overrides later. Exports are collected from the original `Form[]` before macro expansion, because
`Analyzer.analyzeDef` discards metadata and `DefNode` cannot carry it.

**Rationale**: Idiomatic for ClojureScript developers and requires no analyzer change. If original `Form[]`
is not reachable from `compiler.ts` without changes, open a new decision.

### D17: Explicit AS Subset, No `as-raw`

**Date**: 2026-11-05

**Decision**: The AS backend supports an explicit subset; unsupported constructs fail at compile time with
location and reason. Host capabilities come from the `host/` namespace (plain `invoke`, resolved in lowering).
No `as-raw` escape hatch. Differential tests cover only features supported by both backends.

**Rationale**: Predictable behavior; `as-raw` would bypass subset checks and couple user code to runtime internals.

### D18: AS Value Model — Boxed `Value` Class Hierarchy (baseline)

**Date**: 2026-11-05

**Decision**: M2 represents every Kiso value as a heap `Value` (singletons NIL/TRUE/FALSE; `Num`, `Str`, `Kw`,
`Fn`). Each `LFunction` is a class extending `Fn` with captures as fields and `callN`/`invoke` dispatch.
Runtime lives in `packages/kiso/as-runtime/` (outside `src/`, shipped via package `files`); `assemblyscript` is a
devDependency only. Host output via `@external("kiso","write")`; the host supplies memory (`--importMemory`).

**Benchmark gate (M2.5, fib(32), Node, `test/bench/as-vs-js.test.ts`)**: JS backend 13 ms; wasm incremental
499 ms (6.5 KB), minimal 200 ms (4.0 KB), stub 97 ms (2.1 KB). Boxed numbers make wasm 7–38x slower than JS here.
**Consequence**: M3 must first address numeric representation (e.g. unboxed f64/i64 tagged values, or type
specialization of numeric fns) before adding collections. Do not claim a wasm perf advantage until fixed.

### D19: Numeric Specialization in the AS Emitter

**Date**: 2026-11-05

**Decision**: Single-arity, capture-free functions made only of f64 arithmetic/comparisons, `if`/`let`/`loop`/`recur`
and self-calls get a native `nf_<id>(f64…): f64` twin (`codegen-as/numeric.ts`). The boxed `Fn` class calls it when
all args are `Num`, else falls back to the generic body; exports call it directly. Fixes the D18 gate:
fib(32) JS 14 ms vs wasm 11 ms (incremental) / 10 ms (minimal) / 4 ms (stub). Limits: non-numeric code (collections,
strings, polymorphic calls) still pays boxing; a general unboxed representation is deferred until M3 benchmarks show need.

### D20: AS Collections and Performance Model (M3)

**Date**: 2026-11-05

**Decision**: (1) `Vec` shares an append-only backing array (each version sees its first `n` slots) so `conj` is amortized
O(1) and persistence holds; `assoc`/`pop` copy. (2) `MapV` is an insertion-ordered array map with a lazily built
open-addressing index when n > 8, shared along append chains (readers ignore entries at positions >= their n);
`dissoc`/value-update copy. (3) Structural `=` and hashing (nil/bool/num/str/kw/vector/map keys work; the JS backend
cannot look up vector/map keys by value). (4) Small ints [-128,1024) are cached; provably number-typed locals
(`numeric-locals.ts`) are unboxed f64 and boxed only when escaping. (5) Core fns usable as values (`(reduce + 0 xs)`)
via generated `Core_*` Fn classes reusing the inline op emitter. (6) `println` prints Clojure-style; JS `println`
prints `[object Object]`, so differential tests print scalars.
**Subset**: vector, map, keyword, str, count/nth/get/assoc/dissoc/conj/first/second/last/peek/pop/contains?/keys/vals/
vec/reduce/update/get-in/max/min/pr-str/prn and predicates. Not yet: sets, lists/`rest`/`seq`/lazy seqs, `map`/`filter`,
`conj` on nil/lists, rest params (M4+).
**GC flavor matters**: benchmark (Node, warm): fib(32) JS 14 / wasm 4-10 ms; vector build+sum 200k JS 18 / wasm 6-22;
map assoc+get 200k JS 58 / wasm stub 24, minimal 32, incremental 77. Default build profile is `minimal` (`stub` for short-lived
CLI/serverless invocations); `incremental` is slower than JS on allocation-heavy code.

### D21: AS Seqs, Sets and Rest Params (M3.5)

**Date**: 2026-11-05

**Decision**: Seqs are **eager**: `SetV` wraps a `MapV`; lists are list-flagged `Vec`s; `rest`/`next`/`seq`/`cons`/`map`/`filter`/
`take`/`drop`/`range`/`concat`/`into`/`reverse` return fresh list-flagged `Vec`s (O(n), no infinite seqs). `items()` gives a
read-only view of any seqable. Rest params compile to a `rest<N>` method plus a trailing `args.length >= N` dispatch; the rest
value is nil or a list. `apply`, `ex-info`/`ex-message`/`ex-data`, `list`, `hash-set`, `set`, `disj`, `some`, `every?` added.
`dotimes` works because the lowering accepts exactly its two `js*` counters (`i < n`, `i + 1`); all other `js*` stays rejected.
**Still rejected**: `try`/`catch` (wasm/AS has no catchable exceptions; `ex-info` aborts), `for` (uses `.push` js*), lazy seqs,
`sort`, deftype/defrecord/protocols (M4.5). Several of these behave correctly in AS while the JS backend gets them wrong
(`apply` with leading args, 2-coll `map`, `rest`), so those tests are AS-only.

### D22: AS Host Interface and CLI Target (M4)

**Date**: 2026-11-05

**Decision**: (1) `host/args|env|read-file|write-file|stdin|exit|now` lower to runtime fns over a wasm import namespace `host`
(`argc/arg/env/read_file/write_file/stdin/exit/now`); output stays on `kiso.write`. Strings cross the boundary as AS string
pointers; the host allocates results with the exported `__new` (`--exportRuntime`). (2) Because host calls may run in top-level
`def`s, the module is built with `--exportStart _start` and the loader calls `_start` after it holds the instance. (3) `src/host/node.ts`
(`instantiateKiso`) is the shipped Node loader; `host/exit` unwinds with `ExitSignal` and becomes the exit code. (4) `src/codegen-as/build.ts`
drives `asc`; `assemblyscript` is an optional peer dependency (dynamic import, clear error if missing). (5) CLI: `kiso build <file> [-o out.wasm]
[--runtime minimal|stub|incremental]` and `kiso run <file> [-- args]`; `compile --target as` still emits `.as.ts`.
Not yet: `host/fetch` (async; belongs with the serverless target, M5), WASI. Unknown `host/` names and wrong arity are compile errors.

### D23: AS deftype/defrecord/protocols (M4.5)

**Date**: 2026-11-05

**Decision**: Closed-world, statically dispatched. (1) `deftype`/`defrecord` -> class `T_<Name>` (records extend runtime `Rec`:
index-based fields give keyword lookup, `get`, `assoc` on existing fields, `contains?`, `count`, structural `=`/hash and
`#Name{:f v}` printing without reflection). `->Name`, `map->Name`, `(Name. ...)` compile to direct constructors, also usable as values.
(2) `defprotocol` is compile-time only; each `protocolFn` global becomes a generated `PF_*` Fn whose `callN` is an `instanceof` chain over
every implementation in the module (user types, then builtin targets, `reify`, then `default`/`Object`), else `noImpl` aborts.
(3) Methods are ordinary `Fn_<id>` singletons (`MF_<id>`) with `const s_ = changetype<T_X>(this-param)`; fields read `s_.f_x`.
(4) `extend-type` targets: nil, Number, String, Keyword, Boolean, Vector/List/Map/Set/Fn (JS and Clojure names), `default`/`Object`, or a type of
this module. (5) `reify` -> runtime `Reified` holding `"Proto/method/argc"` -> Fn, so closures capture normally.
(6) Protocol methods are lowered with no self-name, otherwise `(sz l)` inside `sz` resolved to the method itself.
**Rejected**: protocols not defined by `defprotocol` in the module (e.g. `Object`, `IFn`), `deftype` inside functions, extra keys via `assoc`/`dissoc` on records,
`instance?`/`satisfies?`, mutable fields. **JS backend bugs found (not fixed)**: record methods emit bare `n` instead of `this.n`, so tests assert
Clojure-correct output directly instead of diffing against JS.

### D24: AS serverless target (M5)

**Date**: 2026-11-05

**Decision**: (1) `kiso build app.cljs --worker [--handler handle] [--out-dir dist]` compiles with `worker: <def>` and emits
`export function kiso_handle(req: string): string` = `jsonStringify(handler(jsonParse(req)))`, plus `worker.js`
(`createWorker(wasm)` from `@clojurewasm/kiso/host/worker`). (2) Request map `{:method :url :path :query :headers :body}`;
response map `{:status :headers :body}`; non-string body is JSON-encoded with default `application/json`. JSON objects parse
to **keyword-keyed** maps (so use `(:x-t (:headers req))`, not `(get headers "x-t")`). (3) **Fresh wasm instance per request**
because the recommended `minimal`/`stub` GC never frees; instantiating a compiled Module is cheap. (4) Host split into
platform-neutral `src/host/core.ts` (`instantiateCore`, `callString`) and Node wrapper `node.ts`; `worker.ts` uses env
bindings (string values only), no fs, `host/exit` -> 500. (5) `host/json-parse` / `host/json-stringify` exposed for user code.
**Not done**: `host/fetch` (async, cannot be called from synchronous wasm; needs JSPI/Asyncify), real workerd/wrangler run
(only Node `Request`/`Response` tests), `kiso serve`.

### D25: AS full-stack (M6)

**Date**: 2026-11-05

**Decision**: (1) Reader conditionals (`#?`, `#?@`) implemented (previously unsupported); enabled for `.cljc` on JS (`['cljs']`) and always on the AS target (`['as','cljs']`). Branch chosen by **feature priority**, not source order, then `:default`; so `:as` beats `:cljs` regardless of position. (2) AS `(:require [ns :as a :refer [...]])` for project-local namespaces is linked by **inlining** deps (dependency order) into the one flat module and rewriting `a/x`, `ns/x` to bare `x` (`src/codegen-as/modules.ts`); duplicate top-level names across namespaces are a compile error; unsupported options (`:only`, `:rename`) and missing namespaces error. CLI resolves `a.b/c.{cljc,cljs}` from the entry dir, its ancestors and their `src/`. (3) `kiso serve <file> [--handler] [--port]` runs the same `createWorker` adapter on node:http for local dev. (4) `.cljc` now accepted by `kiso compile` discovery and `kiso build` naming. (5) `examples/fullstack`: shared `app.shared` (.cljc) used by wasm API and JS client; contract = JSON request/response maps (D24).
**Limits**: no name-spacing of flattened modules (collision = error), no `:refer :all`, no CLJS-only macros in AS, `host/fetch` still deferred, shared code must stay in the AS-supported subset (no lazy seq / try).

### D26: AS lazy seqs, `for`, `sort`

**Date**: 2026-11-06

**Decision**: (1) True lazy sequences on AS: `lazy-seq`, `map`/`filter`/`remove`/`take`/`drop`/`take-while`/`drop-while`/`mapcat`/`concat`/`cons`/`iterate`/`repeat`/`cycle`/`range` (0-arity = infinite); cells cache, so side effects run once. No closures in AS, so each op is a `LazySeq` subclass with `compute()`. `some`/`every?`/`first`/`rest`/`next`/`take` stream, so infinite seqs work; `count`/`reduce`/`into`/`vec`/`apply`/printing/JSON realize. `doall`/`dorun` added. (2) `for` is lazy on AS via an AS-only macro override (`setMacroTarget('as')`; JS expansion unchanged), built from `mapcat`/`map`/`filter`/`take-while`; `:when`/`:let` anywhere, `:while` only directly after a binding. (3) `sort`/`sort-by`/`compare`: stable merge sort; comparator may be 3-way number or boolean predicate; compare orders nil < numbers/strings/keywords/booleans/vectors, aborts on mixed types.
**Limits / deviations**: no 32-element chunking (elements realize one at a time); `rest`/`next` return lazy cells so `(list? (rest xs))` is false; `try`/`catch` stays a compile error (asc 0.28 has no exception handling, AS100); `throw` aborts and the host surfaces an Error; compile-time chain fusion not done.

### D27: tests/clj integration (clojure.test suites)

**Date**: 2026-11-06

**Decision**: The ClojureWasm-origin suites in `tests/clj` run under vitest (`packages/kiso/test/clj-suite/`). A clojure.test subset (`deftest`/`is`/`testing`/`are`/`run-tests`, `thrown?`) is an opt-in compile option `testMacros` (`src/analyzer/test-macros.ts`); assertions print `CLJT pass|fail|error|skip` lines the harness counts. Project namespaces are linked with `linkModules`, now also used on JS (lenient: unknown namespaces such as `clojure.string` stay as `:require`). `baseline.json` is a ratchet per suite and backend (`ran` counts, `unsupported` with the first rejection reason, `broken`); regenerate with `KISO_CLJ_UPDATE=1`. `KISO_CLJ_JVM=1` runs every suite on JVM `clj` (all 11 pass, so the suites are valid).
**Findings**: JS backend runs only 3 of 11 suites without crashing (loop-binding shadowing, `vec` import, unresolved `clojure.set`, etc.); AS rejects every suite at its first missing core fn (`nnext`, `long`, `distinct`, `min-key`, `read-string`, `clojure.string`, `clojure.set`, atoms in the harness, `try`). The baseline reasons are the roadmap for ClojureScript parity on AS. AS `thrown?` assertions are skipped (no `try`). Slow suites and suites needing `eval` are excluded.

## Known Issues

All previously tracked issues (I1–I6) have been resolved. See `archive/bugs-fixed.md` for details.

### ~~I7: `into` 3-arity (transducer) silently returns empty collection~~ (RESOLVED)

Fixed: `into` now supports 3-arity `(into to xform from)` via `transduce`.
Full transducer support: `Reduced`, `transduce`, `completing`, `map`/`filter`/`take` 1-arity.

### ~~I8: defc auto-wrap creates stale closures for prop values~~ (RESOLVED)

Fixed: `injectPropsIntoAutoWrap` moves props destructuring `(let* [{:keys ...} @props-atom])`
inside the auto-wrapped `(fn* [] ...)`, so `@props-atom` runs inside bind's effect. Form-2
components (user returns fn explicitly) keep destructuring outside. Also branched mount()
on renderFn return type: function → bind() handles reactivity, plain hiccup → addWatch.

## Workarounds (Platform Constraints)

- **defc names require hyphen**: Custom Element names require a hyphen (web standard). `(defc counter ...)` fails — use `(defc sample-counter ...)`.
- **Shadow DOM isolates querySelector**: Elements inside `defc` components are invisible to `document.querySelector`. Use plain DOM for shell, su for demos.

## Future Work

### Phase 25: Macro Plugin System

Extract su-specific macros (`defc`, `defstyle`) from kiso core into a plugin architecture.
Currently these 2 macros are hard-coded in `kiso/analyzer/macros.ts`, creating
an implicit reverse dependency from kiso → su.

- 25.1 TypeScript-level macro plugin API (`MacroPlugin` interface in `CompileOptions`)
- 25.2 Move `defc` expansion to `su/src/macros.ts` (su-side plugin registration)
- 25.3 Move `defstyle` expansion to `su/src/macros.ts`
- 25.4 Verify kiso has zero su-specific knowledge after migration

### Q1: clojure.string as .cljs source

Currently implemented as TypeScript runtime module. Future: write `clojure/string.cljs`
and compile during build (requires self-hosted compilation / namespace loading in evaluator).

### Q7: JS Library Interop Ergonomics

`clj->js`/`js->clj` work but are verbose. Future improvements:
- `bean` for ergonomic shallow conversion (implemented)
- Library adapter patterns via codegen hooks
- Keep explicit conversion (no auto-convert at boundaries)

### Known Gaps

- `alter-var-root` not implemented (set! is sufficient for current model)
- Transient collections use copy-on-transient model, not COW in HAMT
- Metadata not auto-propagated through map/filter/reduce
- cljs.spec — may add later as optional
- core.async — may add later as optional

- D28: AS parity batches — atoms, numerics, clojure.string/set builtin ns (prefix rewrite), Kiso-source prelude (hybrid with native runtime), user `defmacro` on both backends, `Sym`, 3-arg comparisons, `()` is a real empty list on AS. tests/clj AS: lists/arithmetic/logic/regression fully pass; try/catch, regex, edn, interop remain unsupported.
- D29: Comparison `< > <= >=` are shared macros following CLJS (1 arg → `(do x true)`, 2 args inline, 3+ → let-bound `and` chain); AS keeps a variadic `kcmpN` for first-class use. JS backend fixes driven by tests/clj: local-shadow renaming (TDZ), nested `def`/`declare`, fn-level `recur`, reserved-word munging, `this`/field binding in deftype, IFn calls via `ifn` for locals/value defs/call results, lazy `map/filter/take/drop/concat/mapcat/...` (infinite seqs), generic `cons/conj/into`, structural hashing + equality for collection keys, quoted map/set literals, `nth`-based destructuring of seqs, printer (`pr-str`/`println`), `clojure.set`/`edn` runtimes, `Character/Integer/Long/Double` helpers. tests/clj JS: all suites pass except eval/future/StackOverflowError (unsupported).
- D30: core.async on both backends via one shared CPS transform over analyzed Nodes (`src/analyzer/go.ts`, same approach as JVM core.async's analyzer-based `go`; CLJS instead transforms Forms). `go`/`go-loop` expand to the special form `go*` and are opt-in per ns via `(:require [clojure.core.async ...])` (`async-ns.ts` strips the spec and de-aliases symbols), so user code may still define `go`. Parks (`<! >! alts!`) become `take!`/`put!`/`go-alts` callbacks; parking `loop` becomes a recursive `letfn` with `recur` through `go-dispatch` (flat stack). Parks inside nested `fn` and inside `try` are rejected (as in core.async). JS runtime `src/runtime/async.ts`; AS runtime channels + task queue in `as-runtime/kiso-runtime.ts`, drained by `kdrain()` after `-main`; `timeout` sleeps via the optional `host.sleep` import (only linked when async is used). `future` is replaced by core.async (not provided). JS `StackOverflowError`/`Throwable`/`Exception` classes added; `eval` not planned (needs compiler + var table at runtime); tests/clj `depth` JS now 19 pass / 4 error (the `future` cases). Shared JS/AS cases in `test/kiso/core_async_test.cljs`. Benchmark re-run: no AS regression.
- D31: Behavioural tests are written in Kiso (clojure.test subset, `test/kiso/*_test.cljs`, run on JS and AS by `test/kiso/kiso-suite.test.ts`; every assertion must pass, `;; expect: N` guards async tests, `;; targets: js` limits a file). `is` on `(= a b)` reports expected/actual. A TS test is migrated only after its `.cljs` port passes on both backends; compiler-internal tests (reader/analyzer/macro-expansion shape such as `defc-macro.test.ts`, emitter, CLI, host, benchmarks) stay TypeScript. Pilot: core.async (TS tests removed).
- D32: Test migration stages 1–2: JS semantics, lazy seqs/sort/for and seq/set/rest-param behaviour now live in `test/kiso/*.cljs` (both backends). Bugs surfaced and fixed: AS destructuring of lazy seqs used `get` (now `nth` on both backends); JS rest params were raw arrays (now nil/list via `restArgs`, Clojure semantics); JS lacked `ex-info`/`ex-message`/`ex-data` (added). Print-format tests stay TS until a `with-out-str` exists.
- D33: Stage 3 pilot (runtime tests): Clojure-visible cases of `test/runtime/seq.test.ts` ported to `test/kiso/seq_core_test.cljs` (both backends pass, no bugs found); TS keeps JS-representation checks (`toArray`, JS arrays). Persistent-structure internals (vector, hash-map, hash, transient, ...) stay TS since they test TypeScript APIs directly.
- D34: Stage 4 (conformance/e2e): threading, destructuring, doseq/for ported to `test/kiso/{threading,threading_interop,destructuring,doseq_for}_test.cljs`; TS originals removed. Bug found: `doseq :while` never stopped the loop on JS (sentinel ignored) and emitted `js*` that AS rejects; `buildDoseqLoop` now passes a continuation (false :when continues, false :while ends that binding's loop). A TS case with two same-arity fn bodies was dropped (invalid Clojure). Staying TS: e2e/compile (emitted-JS string assertions), defmulti, defrecord, su-todo-app, conformance/{interop,macros,protocols} (inject runtime via `new Function` / assert emitted code).
- D35: Migration wrap-up (stages 5–6): remaining TS suites are compiler/runtime-internals by design (analyzer, reader, api, cli, bench, runtime data structures, emit-string e2e/conformance). Kiso suite: 11 files, 252 assertions, run on both backends in ~7s via `test/kiso/kiso-suite.test.ts`; included in `npm test` (no CI change needed). Benchmarks unchanged (fib(32) JS 14ms / wasm 11ms). TS count 1608 → 1484 as duplicated cases moved; every removed TS case has a Kiso equivalent except the invalid same-arity-fn case (D34).
- D36: Runtime test migration (batch 1): vector, hash-map, hash-set fully ported (TS files removed); list, keyword, atom ported with identity/interning/hook cases kept in TS. Gaps found by the ports and fixed: JS lacked `map?`, `set?`, `hash-set`, `keyword?`, `symbol?`; JS `(assoc v (count v) x)` threw (now conj); AS lacked `namespace`. Disagreement left open: `(list? (cons 1 (list)))` is true on JS, false on AS (CLJS vs JVM semantics), kept in TS only.
- D37: Runtime test migration (batch 2): equality and clojure.string ported (`equality_test`, `string_test` on both backends, `string_extra_test` JS-only for functions AS lacks: capitalize, index-of, regex replace/split, split-lines, trim variants, escape); `test/runtime/string.test.ts` removed. JS clojure.string fixed to Clojure semantics: `index-of`/`last-index-of` return nil when absent, regex `replace` is global, `split`/`split-lines` return vectors, `escape` accepts a Kiso map.
- D38: Runtime test migration (batch 3): `test/runtime/core.test.ts` behaviour ported to `test/kiso/core_fns_test.cljs` (both backends) and `core_fns_js_test.cljs` (JS-only: AS lacks `coll?`, `memoize`, `find`, `nfirst`, `trampoline`, `print-str`, etc. — gap list for later). AS gained `==` and `boolean?`. Fixed my fnil expectation. TS `core.test.ts` kept for now (JS-representation and unported cases; duplicates removable later).
- D39: AS prelude gained coll?, associative?, find, nfirst, trampoline, memoize, print-str, merge-with; `core_fns_test.cljs` now runs whole on both backends (JS-only split removed).
- D40: Transducers on both backends. AS: `Reduced` + reduce early exit, `reduced/reduced?/unreduced/ensure-reduced` ops; `map/filter/take` 1-arity and `into` 3-arity route to Kiso prelude (`map-xf`, `filter-xf`, `take-xf`, `into-xf`, `transduce`, `completing`) via `TRANSDUCER_ARITY` in emitter-as. Ported to `test/kiso/transducer_test.cljs`; TS keeps Reduced/function-representation checks.
- D41: Runtime migration batch 4: clojure.set (`set_ops_test`, both backends; TS file removed), clojure.walk (`walk_test`, both; TS removed), sorted-map/set (`sorted_test`, JS-only — AS has no sorted collections yet). AS gained prelude `clojure.set` rename-keys/map-invert/project/rename/index, `clojure.walk` (`cljwalk-` prefix in modules.ts), `keyword`. JS fixes: `set/project`/`set/index` accept Kiso vectors (previously JS arrays only); `sorted-map-by` accepts boolean predicates (`>`); `subseq`/`rsubseq` now follow Clojure signature `(subseq sc test key [test key])` and return a seq of [k v]. Harness exposes `clojure/walk.js`.
- D42: Runtime batch 5: transients (`transient_test`, both backends — AS gets a mutable Transient wrapper over persistent values: transient/persistent!/conj!/assoc!/dissoc!/disj!), metadata (`metadata_test`, JS-only: AS lacks meta), lazy-seq edge cases appended to `lazy_seq_test`. TS keeps transient error cases (AS has no exceptions). array-map/lazy-seq TS kept (internal class API).
- D43: `symbol` on JS now follows Clojure `(symbol ns name)` (was name, ns; AS already correct); analyzer/edn updated. `symbol_test` added (both backends). Remaining TS runtime tests kept by design: array-map, hash, equiv, protocols/protocol-ext, interop*, lazy-seq class API, sorted/transient error cases.
- D44: `with-out-str` on both backends (JS `capture_out`, AS `kcaptureOut`; AS gained `print`/`pr`). `print_test` added. AS gained `float?`, and prelude `ifn?`/`counted?`/`reversible?`/`sorted?`/`prn-str`/`println-str`. `core_more_test` (both) and `core_js_test` (JS-only: regex, arrays/objects, hash/type/instance?) replace `test/runtime/core.test.ts` (deleted).
- D45: Fixed JS emitter bug: top-level `do` (defprotocol/defmulti expansion) defs were treated as nested and hoisted AND declared, giving "Identifier already declared" for a defprotocol in a module with other forms. `flattenTopLevelDo` now runs before def collection. Found by porting the `satisfies?` test (`core_js_test`); also fixed a misnamed test there.
- D46: Test runner gained `use-fixtures` (:each/:once) and message-checking `thrown-with-msg?`; harness strips `export {…};`. JS runtime: `satisfies?` is real, defrecord has map semantics for declared fields (`src/runtime/record.ts`), `(:k coll)` goes through core `get`. New Kiso tests: fixtures, multimethod (JS), record, macros, macros_js (JS), sorted_as. AS gained sorted-map/set (+`-by`, subseq/rsubseq), metadata on vec/map/set/atom, `identical?`, `hash`, `realized?`, and prelude `comparator`/`rand`/`distinct?`/`sequence`/`rseq`/`bit-not`/`vary-meta`/`alter-meta!`. Fixed AS bug: prelude was injected after linked-library forms, so a linked `(def h (memoize …))` ran before `memoize` was set ("Value is not callable"); prelude now precedes all linked forms. tests/clj baseline: p99_trees (154 pass) and p99_graphs (66 pass) now run on AS. Remaining AS gaps: regex/clojure.string extras, char/short, read-string, type/instance?, satisfies?, defmulti, array interop, try/catch/throw, async.
- D47: Batch A migration. Ported conformance/protocols.test.ts (`protocols_test` both backends: deftype, reify, multi-method; `protocols_js_test`: extend-type on js/String|Array, `.-` fields, dispatch errors), conformance/interop.test.ts (`interop_js_test` JS-only; `truthiness_test` both) and runtime/interop.test.ts (`interop_convert_test`, JS-only) to Kiso; deleted the 3 TS files (-41 TS tests). Kept in TS: runtime/protocols.test.ts + protocol-ext (internal defprotocol/protocolFn API, class prototypes), interop-ext (reference identity/shallow checks). Divergences from ClojureScript found and pinned by the tests, NOT changed: `js->clj` always keywordizes keys and ignores `:keywordize-keys`; `js-array` takes one collection instead of variadic args.
- D48: Aligned JS interop with ClojureScript. `js->clj` keeps string keys by default and honours `:keywordize-keys true` (was: always keywordized). `js-array` is variadic; the old collection conversion is now `into-array` / `to-array` (new runtime fns). Tests updated (interop_convert_test, interop-ext.test.ts).
- D49: AS regex (decision: option B, in-wasm engine, no host dependency). `as-runtime/kiso-regex.ts` is a backtracking VM: literals, `.`, classes, \d\w\s (+negations), anchors, \b\B, (capturing and `(?:)`) groups, alternation, greedy/lazy `* + ? {n,m}`, empty-loop guard, 5M step limit (aborts instead of hanging, ReDoS bound). Lookaround, backreferences, named groups and possessive quantifiers abort at construction with a clear message. AS gained regex literals, `re-find`/`re-matches`/`re-seq`/`re-pattern`/`regexp?`, regex + string forms of `str/replace`/`replace-first`/`split` (limit, `$1 $& $$`, fn replacement) and clojure.string `capitalize`/`index-of`/`last-index-of`/`triml`/`trimr`/`trim-newline`/`split-lines`/`escape`, plus `char`/`char?`/`short`/`(int \a)`. JS bugs found by the shared `regex_test`: `#""` emitted `//` (a comment); `re-matches` broke on alternation (`a|ab`); `re-seq` ignored groups and returned `()` instead of nil; `str/split` kept trailing empties and mis-handled limit; `pr-str` of a regex; `regexp?` missing. All fixed. p99_multitrees now runs on AS.
- D50: `satisfies?`/`instance?` on AS, resolved at compile time (closed world): `satisfies?` becomes a generated `SAT_<P>` OR-test over impl targets plus `Reified.hasProtocol`; `instance?` becomes `instanceof` or the built-in target test. JS: `extend-type nil` now registers in `protocol.nil` (dispatch and `satisfies?` honour it); `satisfies?` on nil no longer throws. Test: `satisfies_test.cljs` (both backends).
- D51: AS `read-string` / `clojure.edn/read-string` (EDN reader in `kiso-json.ts`: numbers, strings, chars, keywords, symbols, lists, vectors, maps, sets, nil/true/false, `;` comments; no tagged literals) and mutable arrays (`Arr`: `array`, `aget`, `aset`, `alength`, `aclone`, `into-array`, `to-array`; count/seq/nth work). `type` stays unsupported on AS (returns a JS constructor; no wasm equivalent) and reports a clear error. tests/clj `tier_a` now runs on AS (13 pass). Tests: `read_string_test`, `array_test` (both backends).
- D52: `defmulti`/`defmethod` on AS (decision: runtime registry, same semantics as CLJS/JS, not compile-time dispatch). `MultiFn` is an `Fn` holding dispatch fn + (dispatch-val, method) table + `:default`; `defmethod` (`.addMethod`) lowers to `kmultiAddMethod`; supported.ts allows only `addMethod` interop. Dispatch uses `=`; `isa?`/`derive`/`prefer-method` not implemented (both backends). JS fix: a later `defmethod` for an equal dispatch value now replaces the earlier one. `multimethod_test` now runs on both backends. try/catch stays unsupported on AS (no catchable wasm exceptions in AssemblyScript).
- D53: Stage 4 wrap-up. Design doc 08 gained a *Current Support* section (supported, unsupported and why) and the stale Explicit Subset rows (`try/catch` on AS, `aget`) were corrected. Benchmark spot-check unchanged: fib(32) JS 14ms vs wasm 10ms; vector build+sum 200k JS 18ms vs wasm 10ms warm (minimal GC).
- D54: Backlog batch. (1) `case` without a default on AS: the analyzer's synthesized `(throw (new Error ...))` now lowers (`new Error|Exception|Throwable` with 1 arg becomes an ex-info value; throwing aborts). (2) `implements?` on both backends with CLJS semantics (inline implementations only; natives extended via extend-type do not count). NOTE: correcting an earlier claim — `satisfies?` "any method" already matches Clojure/CLJS (a type is registered per protocol, partial implementations count), so it is unchanged. (3) Global hierarchy: `derive`, `underive`, `parents`, `ancestors`, `descendants`, `isa?` (keywords/symbols, vectors elementwise; no class hierarchy, like CLJS) and `prefer-method`; MultiFn now falls back to `isa?` matching with `prefer-method` / dominance for ambiguity, then `:default`. Explicit (non-global) hierarchies are not supported. (4) Bug found via p99_puzzles: `map` with 3+ collections (incl. `(apply map vector rows)`) aborted on AS; now `kmapN`. `p99_puzzles` runs on AS (62 pass). Deliberately not done: `eval` and JS interop on AS (no compiler / no JS host inside wasm), `type`.
- D55: Metadata is now carried over by conj/assoc/dissoc/disj/pop/update/empty (and thus assoc-in/update-in/merge) on both backends (JS `keepMeta` wrappers over a WeakMap store; AS `keepMeta` copies the collection shell only when the source has meta). `metadata_test` now runs on both backends; new `meta_preserve_test`. Keyword "interning" is not needed: `identical?` already compares keywords by value on both backends (symbols are not identical, as in CLJS), so it stays a non-goal. Added `extend-protocol` macro (CLJS has it; Kiso did not). `extend` (the function) is Clojure-only and not in CLJS, so it is not provided. Not done by design: `eval`, JS interop on AS.
- D56: Assertion audit of the TS-to-Kiso test migrations (eba4f77 seq, 0730e7e transducer) found 4 assertions lost: `(identical? l (seq l))`, `(some? (seq [1 2 3]))`, vector early-`reduced` at threshold 3, and the wrapped value of `reduced`. All restored in `seq_core_test.cljs` / `transducer_test.cljs`. The `reduced` one exposed a real gap: `deref` of a `Reduced` failed on both backends (CLJS `Reduced` implements IDeref); fixed in JS `deref` and AS `kderef`.
- D57: `host/fetch` on AS (channel based, decided with the user: option A; CLI stays on the Node host; serverless is verified with miniflare next). `(host/fetch url opts)` returns a channel and registers the request with the host (`host.fetch_start`). `kdrain` returns when only host requests remain; the host awaits them and calls `kiso_resume(id, json)`, which fills the channel and drains again. Failures arrive as `{:error msg}` (AS has no try/catch). Host API: `HostOptions.fetch`, `runMainAsync()`, `callStringAsync()`; `createWorker` accepts `fetch` and `kiso_handle` supports go-block handlers (`kiso_result`). Known limitation: while any request is pending, timers wait until it completes.
- D58: CLI example `examples/cli-todo` (argv, fs, stdin, JSON, exit codes) with e2e tests in `test/examples/cli-todo.test.ts`. It exposed two gaps, both fixed on JS and AS with CLJS semantics: `parse-long` and `parse-double` were missing (nil for non-numeric input, error for non-strings), and `kiso run` used the synchronous `runMain`, so `host/fetch` never completed; it now uses `runMainAsync`.
- D59: Serverless verified on Cloudflare workerd through Miniflare (`test/serverless/miniflare.test.ts`, miniflare as devDependency; worker bundled with esbuild, wasm as a CompiledWasm module). Covers sync routes, JSON bodies, go-block handlers awaiting `host/fetch`, upstream 5xx mapping, concurrency, and a probe proving the code runs in workerd. Note: Miniflare turns an `outboundService` throw into an HTTP 500 response, so the reject path of `host/fetch` is covered by the host unit tests instead.
- D60: Full-stack flow test on the real `examples/fullstack` sources (`test/e2e/fullstack-flow.test.ts`): shared `.cljc` parity on both backends, wasm API endpoints, and a JS client whose validation matches the server. It exposed a JS deviation from CLJS: maps printed and iterated in hash order. The JS runtime now keeps up to 8 entries in insertion order (`ArrayNode`, like CLJS array-map) and converts to the HAMT at the 9th key; AS already kept insertion order. `map_order_test` pins this on both backends.
