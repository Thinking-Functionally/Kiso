# 09 — Wasm FFI (calling Rust-generated wasm from Kiso)

Status: **S0 design (D73)**. Implementation: S1 numbers/bool/string, S2 arrays, S3 EDN, S4 errors/memory, S5 build/CI/docs.

## Goal

The same ClojureScript source compiles to the JS and the AssemblyScript backend **with no difference at the cljs level**, and can call wasm modules generated from Rust through one FFI form. Go and C are out of scope; the ABI below is plain C ABI, so they are not excluded later, but nothing is tested for them.

## cljs surface

```clojure
(defwasm add   "solver" [:i32 :i32] :i32)            ; export name = munged symbol name ("add")
(defwasm scale "solver" "scale_all" [:f64s :f64] :f64s) ; explicit export name
(defwasm query "solver" [:edn] :edn)
(add 1 2)
```

`(defwasm name module [export] [arg-types] ret-type)` is a core macro (`analyzer/macros.ts`). It expands to

```clojure
(defn add [a0 a1] (host/wasm-call "solver" "add" "ii>i" a0 a1))
```

so the generated var is an ordinary function (first-class, works with `map`, `apply`, …) on both backends. `module` is a *logical* name; the host links it to bytes (below). Unknown module, export or signature mismatch is a runtime error naming the module and export.

### Types

| Type | cljs value | wasm parameters | sig char |
|---|---|---|---|
| `:i32` | integer | `i32` | `i` |
| `:f64` | number | `f64` | `d` |
| `:bool` | boolean | `i32` (0/1) | `b` |
| `:str` | string | `ptr: i32, len: i32` (UTF-8 bytes) | `s` |
| `:f64s` | array of numbers | `ptr, len` (len = elements, 8-byte LE) | `D` |
| `:i32s` | array of integers | `ptr, len` (4-byte LE) | `I` |
| `:u8s` | array of 0..255 | `ptr, len` | `B` |
| `:edn` | any EDN value | as `:str`; macro wraps with `pr-str` / `read-string` | `s` |
| `:nil` (ret only) | `nil` | no result | `v` |

`:i64` is not supported (JS needs BigInt, AS has no uniform number type for it). Large integers travel as `:f64` (exact to 2^53) or `:str`.

Array arguments accept any seqable on both backends (the call converts); array results are returned as arrays (`aget`/`alength`-compatible; on JS a plain Array, on AS an `Arr`). `:edn` round-trips whatever `pr-str` and `read-string` support on that backend: numbers, strings, chars, keywords, symbols, lists, vectors, maps, sets, nil, booleans. No tagged literals.

### Signature string

`<args>><ret>`, e.g. `"ii>i"`, `"sd>s"`, `"D>d"`, `"s>v"`. The macro generates it; users never write it.

## Rust side ABI (plain C ABI, `wasm32-unknown-unknown`)

- No wasm-bindgen. `panic = "abort"`.
- Every module exports the allocator pair:
  - `kiso_alloc(len: i32) -> i32` — returns a pointer to `len` writable bytes (0 for len 0).
  - `kiso_free(ptr: i32, len: i32)`.
- Scalars map directly (`i32`, `f64`, bool as `i32`).
- `:str` / array arguments are `(ptr, len)` pairs, **borrowed** for the duration of the call (the host allocates them with `kiso_alloc` and frees them after the call).
- `:str` / array results are returned as one **`i64` packed value `(len << 32) | ptr`**, allocated by the module (with `kiso_alloc` semantics). The host copies the bytes out and calls `kiso_free(ptr, len)`.
- **Errors:** a function that returns a packed value may return `0` to signal failure only if the module exports `kiso_last_error() -> i64` (a packed UTF-8 message, same ownership as a result). An empty-but-successful result is `len = 0` with a non-zero `ptr` (the template returns `1`). Scalar-returning functions cannot fail except by trapping.
- Functions are pure with respect to host memory: the module may not retain borrowed pointers.

The `crates/kiso-ffi` crate implements `kiso_alloc`, `kiso_free`, packing helpers, `set_last_error` / `kiso_last_error`, and (S3) the EDN codec. It has no dependencies: the existing crates were rejected (`edn-rs` is deprecated; `edn-format` pulls in `bigdecimal`, `uuid`, `num-*`, which bloats wasm and parses more than the Kiso subset).

## Linking and the two backends

The wasm bytes are provided by the **host**, never baked into compiled output:

```js
// JS backend
import { registerWasm } from '@clojurewasm/kiso/runtime';
await registerWasm('solver', bytesOrModuleOrInstance);   // async instantiate

// AS backend (Node host)
await instantiateCore(kisoWasm, { wasm: { solver: bytesOrModuleOrInstance } });
// CLI:  kiso run app.cljs --wasm solver=./solver.wasm
```

Both paths use one shared linker (`src/host/wasm-link.ts`) that owns marshalling and memory ownership: `call(module, export, sig, args) -> value`. Strings are UTF-8-encoded, arrays are copied into the callee's memory with `kiso_alloc`, results are copied out and freed. Because the AS module and the Rust module have **separate linear memories**, the host copies between them; there is no shared memory.

- **JS backend**: `host/wasm-call` compiles to the runtime function `host_wasm_call(module, export, sig, ...args)` (`HOST_JS`), which converts Kiso arrays/seqs to typed arrays and calls the linker.
- **AS backend**: `host/wasm-call` lowers to `hostWasmCall(module, export, sig, [args])` in the AS runtime. It streams the call through generic `host` imports (`wasm_begin`, `wasm_arg_i32|f64|str|buf`, `wasm_invoke`, `wasm_ret_i32|f64|str|buf`) so no per-function `@external` declaration is needed and any host (Node, worker, a Rust/Go/C embedder) can implement the same small import set. AS arrays and strings cross the boundary as `ArrayBuffer`/`string` (known runtime ids 1 and 2), so the host needs no compiler-assigned class ids.

## Errors

- A packed result of `0` plus `kiso_last_error` → the host throws an error with the module's message. On JS it is a normal catchable exception (`ex-info`-compatible data `{:module … :export …}`); on AS there is no `try`, so it aborts like any other AS error (D66) and the host reports it at the boundary. **The only observable difference between backends is therefore catchability**, which already holds for every error on AS.
- Unknown module/export, arity or type mismatch: error naming the module and export.
- A trap inside the Rust module propagates as a JS exception through the AS module.

## Memory

- Host-side: every borrowed argument is freed with `kiso_free` after the call, also when the call throws; every result is copied then freed.
- AS side: the `minimal` runtime never frees, so repeated FFI calls leak AS strings/arrays. The runtime reuses one scratch frame for call arguments and returns results as fresh values only (S4 measures and may recommend `--runtime incremental` for FFI-heavy programs).
- Coarse-grained calls win: each call copies its arguments, so pass whole arrays, not elements (benchmarked in S2).

## Testing

- `crates/ffi-fixture` is the Rust fixture (add, scale, concat/upper, array sum/map, echo bytes, EDN echo, failure). It has native `cargo test` cases mirroring the cljs tests. The built wasm is committed to `packages/kiso/test/fixtures/ffi_fixture.wasm` (rebuild with `npm run build:fixtures`; tests do not need cargo).
- `test/kiso/ffi_*_test.cljs` is the conformance suite: each file runs on **both backends** (`;; wasm: solver=test/fixtures/ffi_fixture.wasm`), so any divergence is a compiler/runtime bug, per the project rule.

## Out of scope

Go/C modules, `:i64`, tagged literals, shared memory, async Rust functions, host callbacks from Rust into Kiso, component model / WIT.
