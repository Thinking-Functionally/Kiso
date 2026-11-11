# Calling Rust (wasm) from Kiso

`defwasm` binds a function exported by a Rust-built wasm module. The same ClojureScript source runs unchanged on the JS and AssemblyScript backends. Design: `.dev/design/09-wasm-ffi.md`.

```clojure
(defwasm upper "fixture" [:str] :str)            ; export "upper"
(defwasm sum-f64s "fixture" [:f64s] :f64)        ; export "sum_f64s"
(defwasm edn-stats "fixture" [:edn] :edn)
(defwasm add2 "fixture" "add" [:i32 :i32] :i32)  ; explicit export name
```

## Types

| type | cljs value | wire |
|---|---|---|
| `:i32` `:f64` `:bool` | number / boolean | scalar |
| `:str` | string | UTF-8 `(ptr,len)` |
| `:f64s` `:i32s` `:u8s` | any seqable of numbers (result: vector) | `(ptr,count)` |
| `:edn` | any EDN value | string, `pr-str` / `read-string` |
| `nil` (result only) | nil | none |

`:edn` limits: integers beyond 2^53 lose precision; non-finite numbers are not supported; BigInt is rejected.

## Rust side

Use the `kiso-ffi` crate (`crates/kiso-ffi`): `kiso_abi!` exports `kiso_alloc`/`kiso_free`/`kiso_last_error`; helpers `str_arg`, `f64_arg`, `i32_arg`, `bytes`, `pack_*`, `fail`, and an EDN codec. See `crates/ffi-fixture` for examples. Build with `cargo build --target wasm32-unknown-unknown --release`.

## Linking

- **CLI**: `kiso run app.cljs --wasm fixture=path/to/m.wasm` (repeatable; also `serve` and `build`). `build --worker` copies each module to `<name>.ffi.wasm` and wires it into the generated `worker.js`.
- **Workers** (Cloudflare): modules are passed precompiled, `createWorker(app, { wasm: { fixture } })`.
- **JS backend, Node**: `defaultLinker.register("fixture", bytes)`.
- **JS backend, browser**: `await registerWasm("fixture", fetch(url))` (falls back when the server omits the `application/wasm` type).
- **Embedding AS**: `instantiateKiso(src, { wasm: { fixture: bytes } })`.

## Behaviour to know

- Errors: a Rust failure throws `wasm: <module>/<export> failed: <message>`. On JS it is catchable; on AS (no try/catch) it aborts, and a worker answers 500.
- Programs using `defwasm` are built with the `incremental` GC by default (the `minimal` GC leaks per call); `--runtime` overrides.
- Per-call overhead is about 50 ns on JS and 0.8 µs on AS, so put loops inside Rust and pass arrays. Bulk calls beat pure cljs (`npm run bench:ffi`).
- Only Rust-style C ABI modules are supported; AS has no `double` type.
