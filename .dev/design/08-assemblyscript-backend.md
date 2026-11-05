# 08 — AssemblyScript Backend

Status: **M0 and M1 complete** (lowering). The AS emitter (M2) is not implemented yet.

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
`try/catch/throw` (typed), finite seq functions (`map`, `filter`, `reduce`, `take`, `assoc`, `get`, `update`, ...).

Partial: lazy-seq (finite only), multimethod (no `derive` hierarchies), numeric semantics (overflow,
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
| M4 | `host/` + CLI target (Node WASI) |
| M5 | Serverless target (Cloudflare Workers) |
| M6 | Full-stack: shared `.cljc` (`#?(:cljs … :as …)`), serialization, API contract, sample app |

## Open Questions

1. `Value` representation: class hierarchy (initial choice) vs tagged union / `externref`.
2. AS runtime flavor: `incremental` default; evaluate `stub` for short-lived CLI/serverless.
3. Compilation unit: whole program (initial) vs per-namespace modules.
4. Reader conditional feature key for AS (`:as`) — requires a reader check; no change planned yet.
