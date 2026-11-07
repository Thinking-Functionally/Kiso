# 08 — AssemblyScript Backend

Status: **M0–M6 complete, plus parity work D20–D65** (collections, lazy seq, records/protocols, core.async, regex, read-string, arrays, multimethods, `host/fetch`, serverless on workerd, CLI and full-stack examples, custom hierarchies, `type`). Remaining gaps are listed under *Current Support* below.

## Current Support (D65)

Both backends run the same `test/kiso/*_test.cljs` suite (`clojure.test`); `;; targets: js` marks JS-only files.

Supported on AS: everything in the Explicit Subset except the rows below, plus
- `clojure.string` (incl. regex-based `replace`/`split`), `clojure.set`, `clojure.walk`, `clojure.edn/read-string` and `read-string`;
- regex via an in-wasm backtracking engine (`as-runtime/kiso-regex.ts`, D49): classes, anchors, groups, alternation, greedy/lazy quantifiers, leading `(?i)(?s)(?m)`, 5M step limit against ReDoS. Lookaround, backreferences and named groups abort at construction;
- `satisfies?` / `instance?` resolved at compile time (closed world, D50);
- mutable arrays (`array`, `aget`, `aset`, `alength`, `aclone`, `into-array`, `to-array`, D51);
- `defmulti` / `defmethod` through a runtime `MultiFn` registry with `:default`, global hierarchy (`derive`, `isa?`, `parents`, `ancestors`, `descendants`, `underive`) and `prefer-method` (D52, D54); custom hierarchies (`make-hierarchy`, h-arity `derive`/`underive`/`isa?`/`parents`/`ancestors`/`descendants`, D63; no `defmulti :hierarchy`);
- host layer (`host/args env read-file write-file stdin exit now json-parse json-stringify`, and channel-based `host/fetch` usable from go blocks, D57); `host/json-*` also work on the JS backend (D61); `parse-long`/`parse-double` (D58);
- `type` returns a symbol naming the runtime type (`Number`, `PersistentVector`, a record's name; D62), not a JS constructor;
- `case` without a default, `implements?`, `extend-protocol`, `map` over 3+ collections, metadata carried through `conj`/`assoc`/`dissoc`/`disj`/`pop`/`update`/`empty` (D54, D55).

Not supported on AS (compile error or abort with a clear message):
- `try` / `catch` / `finally` / `throw`: AssemblyScript has no catchable exceptions (`ex-info` aborts). Revisit when AS supports the wasm exception-handling proposal;
- comparing `type` with `js/Number` etc., and `eval` (needs the compiler at runtime);
- JS interop (`js/`, `.method`, `new` of non-module types): wasm has no JS host inside the module; use `host/` functions.

## try/catch on AS: evaluation (D66, decision: not implemented)

Today `try`/`catch`/`finally`/`throw` is a compile error and `ex-info` aborts (a wasm trap). The host turns a trap
into an error at the boundary (worker: HTTP 500 "kiso error: …", CLI: non-zero exit). The worker host instantiates a fresh module per request, so a trap cannot corrupt later requests.

Options considered:
1. **wasm exception-handling proposal.** The right long-term answer, but AssemblyScript has no `try/catch` codegen (it lowers `throw` to `abort`). Blocked on upstream.
2. **Sentinel/pending-exception flag.** `throw` sets a global and returns `NIL`; every call site checks the flag and unwinds. Works with today's toolchain but adds a check after every call (size and speed cost on the hot path, roughly the cost of the numeric specialization we just won), and every runtime function that calls user code (`map`, `reduce`, multimethods, go blocks) must propagate it. Large, invasive change.
3. **Result-returning host calls.** Keep `ex-info` fatal; make fallible host APIs return `{:error ...}` (e.g. `host/json-parse`, `host/read-file`, `host/fetch` already reject at the host). Small and covers the real use cases (I/O and parsing failures).
4. **Instance-per-request recovery.** Abort at the boundary and instantiate a fresh module for the next request. Cheap (modules are ~30 KB) and gives true isolation.

Decision: do not add try/catch now. Use (4) for serverless (already how the worker host works: one instance per request), and (3) for the API surface as needed. Revisit (1) when AssemblyScript supports exception handling; (2) only if a concrete program cannot be expressed with result values.

## M3 Outcome

- Vectors, maps (insertion-ordered, indexed past 8 entries), keywords, strings, structural `=`/hash, core fns as first-class values, keyword/map/vector as functions; see D20 for the exact subset and limits.
- Performance: number-typed locals are unboxed, small ints cached, default build uses the `minimal` GC (D20). Warm Node timings: wasm beats JS on fib, vector and map benchmarks except with the `incremental` GC on map-heavy code.
- Differential tests (`collections.test.ts`) cover 13 programs plus AS-only semantics (structural keys, printing).

## M2 Outcome

- `as-runtime/kiso-runtime.ts` (D18): boxed `Value` hierarchy, core numeric ops, `=`, `println`/`str`, `throwValue`, `Fn` base with `call0..3`/`invoke`.
- `codegen-as/emitter-as.ts`: `LModule` → AS source. Supported: literals (nil/bool/number/string/keyword), `def`, `defn`/`fn` (multi-arity, closures, `letfn`), `if`/`let`/`loop`/`recur`, `+ - * / mod rem inc dec < > <= >= = not not= zero? pos? neg? println str`. Everything else is a compile error with a milestone hint (collections M3, deftype/protocols M4, ns requires M5).
- Exports: `^:export` fns through an f64 ABI (`export function fib(a0: f64): f64`), `-main` as `main(): void`.
- `compileAs` now returns `{code}`; tests build with the asc API (`test/codegen-as/helpers/build-wasm.ts`) and run in Node.
- Differential harness (`helpers/differential.ts`): 12 programs print identically on JS and wasm.
- Also fixed a pre-existing analyzer bug: `(defn ^:export f …)` failed (`fn* requires params vector`).
- **Benchmark gate**: initially boxed numbers made wasm 7–38x slower (D18); numeric specialization (D19) brings fib(32) to JS 14 ms vs wasm 4–11 ms. M3 may start; re-benchmark collection-heavy code there.

## M1 Outcome

- `codegen-as/supported.ts`: rejects JS-only constructs (`AsUnsupportedError`, with node index mapped to line/col in `compile.ts`).
- `codegen-as/lowered.ts` + `lower.ts`: `Node[]` → `LModule` (statement-oriented IR):
  - **Flattening**: expression-position `if/let/try/loop/case*/letfn` become statements + temps. Argument evaluation order is preserved by spilling earlier non-atomic arguments (including global vars) when a later argument emits statements.
  - **Closures**: by-value captures resolved through enclosing functions (own scope tracking; the analyzer's `var-ref.local` flag is unreliable because top-level defs are also marked local). `letfn` creates closures together; named fns reference themselves via kind `self`; deftype/defrecord fields are kind `field`.
  - **Tail position**: sinks (`return` / `assign` / `loop-exit`) validate `recur`; recur across `try`, outside tail position or with wrong arity is a compile error. Arities using recur are wrapped in a `loop`.
  - **Arities**: multi-arity and variadic fns become explicit `LArity` lists.
  - **Host calls**: `host/…` invokes become `host-call`.
- `collect-exports.ts`: `^:export` + `-main`, from original `Form[]`; `compileAs` validates `--export` names.
- `compile(source, { target: 'as', exports })` and `kiso compile --target as --export <name>`; `compileAs` currently throws "emitter not implemented" after successful lowering.
- Smoke test over `.dev/codegen-samples/cljs`: 11/16 lower; the other 5 use `js/` or interop (expected rejections).


## Goal

Add an AssemblyScript (AS) backend that coexists with the JavaScript backend. The existing
architecture is unchanged; the AS backend is purely additive. Intended targets:

- **CLI** — WASI executable (Node WASI first).
- **Serverless** — Request → Response handler (Cloudflare Workers first).
- **Full-stack** — shared `.cljc` code; browser stays on the JS backend + `su`.

## Non-Goals

- No changes to the reader, analyzer, `Node` types, `emitter.ts`, `runtime/` or `su`.
- No IP-protection claims. Wasm raises the bar for reading code but is not a protection mechanism.
- No general-purpose Porffor path (experimental; may be revisited as a perf experiment only).
- No `as-raw` escape hatch (see Surface Constructs).
- No guarantee that arbitrary `.cljs` compiles to AS. AS supports an explicit subset.

## Motivation (what Wasm buys us, and what it does not)

| Environment | Value of Wasm |
|-------------|---------------|
| CLI | Fast start, portable, WASI capability model |
| Serverless | Cold start, small bundle, sandbox isolation |
| Server (long-running) | Roughly neutral vs V8 |
| Browser | Only for compute-heavy modules; DOM still goes through JS |

Performance is **not assumed**. The AS runtime must reimplement persistent collections, keywords,
protocol dispatch and closures without V8's JIT/GC. Benchmarks are a gate from M2 onward.

## Pipeline

```
reader → analyzer → Node[] ─┬─ emitter.ts      → JS        (unchanged)
                            └─ codegen-as/     → AS → wasm (new)
```

The only touch points on existing code:

1. `api/compiler.ts`: an optional `target: 'js' | 'as'` (default `'js'`).
2. `cli`: `--target as`.

## Module Layout (all new)

```
packages/kiso/src/codegen-as/
  collect-exports.ts   Form[] → export list (^:export), run BEFORE macro expansion
  lower.ts             Node[] → lowered nodes (reject JS-only nodes, closure capture, tail analysis, flattening)
  lowered.ts           Lowered node types (AS only; independent of analyzer/node.ts)
  emitter-as.ts        lowered → AssemblyScript source
  host.ts              host/ function table (name → AS implementation + signature)
packages/kiso/src/runtime-as/   AS runtime (Value, vector, map, keyword, ...)
packages/kiso/test/codegen-as/  unit + differential tests
```

## Why No Full IR (D13)

Current AST (`analyzer/node.ts`, 85 lines) is mostly backend-neutral. `emitter.ts` is a single-pass
AST → string emitter with no reusable intermediate data. It relies on JS facilities AS lacks:

| JS emitter technique | AS consequence |
|----------------------|----------------|
| IIFE for `loop` / `try` in expression position | Needs real flattening with temporaries |
| `recur` via `while(true)` + `continue` inside `emitStmt` | Needs explicit tail-position analysis |
| Closures are native | Needs closure conversion (env object + function table) |
| Multi-arity via `switch(args.length)` + array destructuring | Needs per-arity functions + dispatch |
| `try/catch` with `instanceof`, throws any value | Typed exceptions only |

All of this is done in `lower.ts`. A standalone IR is deferred until M2/M3 shows `lower.ts` is too
complex, or type specialization requires it.

## Lowered Nodes (D14)

Defined only in `codegen-as/lowered.ts`.

Internal (produced by `lower.ts`; users never see them):
`closure`, `fn-table`, `temp-let`, `loop-stmt`, `tail-recur`.

Deferred to M3+: `box` / `unbox`, `typed-literal` (type specialization).

## Handling of Existing `Node` Types

| Category | Nodes | AS behavior |
|----------|-------|-------------|
| Shareable | `literal`, `keyword`, `vector`, `map`, `set`, `var-ref`, `invoke`, `if`, `do`, `let`, `letfn`, `fn`, `def`, `recur`, `loop`, `throw`, `try`, `case*`, `deftype`, `defrecord`, `extend-type`, `reify`, `ns` | Supported (several need lowering) |
| JS-only | `js-raw`, `js-array`, `js-object`, `interop-call`, `interop-field`, `new` (JS ctor) | Compile error with file/line and reason |
| Conditional | `set!`, `literal` (`jsType`), `var-ref` with `js/`, `try` `exType` | See below |

`set!` (D15): macros such as `binding` expand to `set!` on a var (`macros.ts`). Lowering accepts `set!` whose
target is a `var-ref` (global assignment) and rejects `set!` on interop targets.

`literal`: numbers default to `f64` (JS-compatible). Integer typing is deferred to M3+.

## Host Interface

AS has no `js/`. Host capabilities are reached through the `host/` namespace. No new analyzer node:
`(host/args)` is an ordinary `invoke` of `var-ref` `host/args`; `lower.ts` recognizes the prefix and
resolves it through `host.ts`. Each target supplies its own implementation (CLI: WASI; serverless: platform
bindings). The JS backend may later provide same-named implementations so shared code runs on both.

Initial surface (to be refined at M4): `host/args`, `host/env`, `host/read-file`, `host/write-file`,
`host/stdin`, `host/exit`, `host/now`, `host/fetch`.

## Exports and Entry Points (D16)

ClojureScript idiom, no analyzer change:

1. `^:export` on `def` / `defn` marks an export, e.g. `(defn ^:export handle [req] ...)`.
2. `-main` is the default CLI entry (mirrors ClojureScript `:main` / `-main`).
3. Config `:exports` (shadow-cljs style) overrides/extends. Later milestone.

Reader keeps metadata as `(with-meta sym {:export true})`, but `Analyzer.analyzeDef` discards it
(`DefNode` has only `name`, `init`, `doc`). So `collect-exports.ts` scans the original `Form[]`
**before** macro expansion (`defn` is a macro; `expandDefn` may relocate metadata). Missing entry
points are a compile-time error listing available defs.

If `compiler.ts` cannot hand over the original `Form[]` without changes, open a new decision
instead of silently modifying the analyzer.

## Explicit Subset (D17)

Differential testing covers only features marked supported on both backends.

Supported: `def`, `defn`, `fn` (multi-arity, variadic), `let`, `loop/recur`, `if`, `cond`, `case`,
`do`, closures, destructuring, threading and other macros (expanded at compile time), list / vector /
map / set / keyword / symbol / string / number, `atom` / `swap!` / `reset!`, protocols, `defrecord`,
finite seq functions (`map`, `filter`, `reduce`, `take`, `assoc`, `get`, `update`, ...).

Partial: lazy-seq, multimethod (no `derive` hierarchies), `try/catch/throw` (JS only), numeric semantics (overflow,
big numbers), string/regex differences, `pr-str` formatting.

Unsupported (compile error): `eval`, `load-string`, dynamic `require`, `js/` interop, `js-raw`, `aget` / `set!`
on JS objects, DOM, `su` (`defc`, `defstyle`), throwing arbitrary JS values, reflection (`resolve`, `ns-publics`).

Support status is tracked in `.dev/status/vars.yaml` (new `as` field: `full` / `partial` / `none`).

## Surface Constructs

- `host-call`: via the `host/` prefix (no new syntax).
- Export: `^:export` metadata.
- `as-raw`: **not provided**. It bypasses subset checks, depends on runtime internals and cannot be
  differential-tested. Extend `runtime-as/` and call through normal `invoke` instead.

## Milestones

| M | Content |
|---|---------|
| M0 | This document + tracker decisions D13–D17 |
| M1 | `lower.ts`: JS-only rejection, closure capture, tail analysis, flattening |
| M2 | Vertical slice: `defn` + arithmetic + `println` → wasm → run on Node; differential test + benchmark harness |
| M3 | Core data structures (vector, map, keyword, `str`) |
| M3.5 | Sets, lists, eager seqs, rest params, `apply`, `dotimes`, `ex-info` (D21) |
| M4 | `host/` + CLI target: `kiso build`/`kiso run`, Node loader (D22; `host/fetch` deferred to M5) |
| M4.5 | deftype/defrecord/protocols/reify/extend-type, static dispatch (D23; lazy seq and `try` remain deferred) |
| M5 | Serverless target: `--worker`, `kiso_handle`, `createWorker`, JSON host fns (D24; `host/fetch` deferred) |
| M6 | Full-stack: reader conditionals, AS module linking, `kiso serve`, `examples/fullstack` (D25) |

## core.async (D30)

`go`, `go-loop`, `chan` (fixed / dropping / sliding buffers), `put!`, `take!`, `close!`, `offer!`,
`alts!`, `timeout` work on both backends and are differential-tested (`test/kiso/core_async_test.cljs`).

- **Transform**: `go`/`go-loop` expand to the special form `go*`; `src/analyzer/go.ts` CPS-transforms the
  analyzed Nodes (the JVM core.async also transforms an analyzer AST; CLJS transforms Forms instead).
  Parks (`<!`, `>!`, `alts!`) become `take!` / `put!` / `go-alts` callbacks. `if`/`let`/`letfn`/`case*` share a join
  continuation. A parking `loop` becomes a recursive `letfn`; `recur` goes through `go-dispatch`, so the stack stays flat.
  The output only uses `fn` / `let` / `letfn` / `if` / `invoke`, so neither emitter needs special support.
- **Limits** (same as core.async): no park inside a nested `fn`; no park inside `try`.
- **Opt-in**: `go`/`go-loop` are active only when the ns requires `clojure.core.async` (`async-ns.ts` strips the
  spec and de-aliases symbols), so user code may define its own `go`.
- **JS**: `src/runtime/async.ts`; callbacks are queued and drained on a microtask.
- **AS**: channels and a task queue in `as-runtime/kiso-runtime.ts`. `kdrain()` runs after `-main` (only emitted when the
  module uses async). When only timers remain it sleeps through `host.sleep` (optional import, `HostOptions.sleep`).

`future` is not provided (it has no CLJS equivalent; use core.async). JS also gains `StackOverflowError`, `Throwable`
and `Exception` for `catch` / `instance?` (structural `Symbol.hasInstance` over `RangeError` / `Error`). Not planned:
`eval` (needs the compiler and a global var table at runtime) and catching stack overflow on AS (a wasm trap).

## Open Questions

1. `Value` representation: class hierarchy (initial choice) vs tagged union / `externref`.
2. AS runtime flavor: `incremental` default; evaluate `stub` for short-lived CLI/serverless.
3. Compilation unit: whole program (initial) vs per-namespace modules.
4. Reader conditional feature key for AS (`:as`) — requires a reader check; no change planned yet.
