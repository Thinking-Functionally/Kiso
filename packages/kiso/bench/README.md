# Benchmarks

JS backend vs AssemblyScript (wasm) backend, each on Node and Bun.

```sh
npm run build && npm run bench      # node bench/run.mjs [runs]; Bun columns need `bun` on PATH
```

Each program is compiled by the `kiso` CLI (JS bundled with esbuild; wasm with the default `minimal` runtime).
Times are the median of N in-process runs of `-main` (instantiation excluded). Sizes are the artifact sizes.

Results (Apple Silicon, Node 26.11, Bun 1.x, median of 7, ms):

| program | wasm KB | js KB | node/js | node/wasm | bun/js | bun/wasm |
|---|---|---|---|---|---|---|
| fib 32 (call + arithmetic) | 27.8 | 43.0 | 14.6 | 10.7 | 21.4 | 5.3 |
| maps (50k assoc + get) | 30.4 | 45.6 | 12.7 | 17.4 | 16.1 | 22.9 |
| seqs (300k map/filter/reduce) | 30.2 | 45.1 | 36.5 | 34.7 | 23.2 | 32.8 |
| strings (apply str, 50k) | 29.6 | 44.9 | 3.6 | 8.9 | 4.9 | 11.7 |

Reading the numbers:
- Tight numeric/call code is where wasm wins (1.4x on Node, 4x on Bun).
- Collection- and string-heavy code is on par or slower in wasm: the AS persistent collections and boxed `Value`s are younger than V8's tuned JS runtime. Choose AS for isolation, size and portability (serverless/CLI), not raw collection speed.
- Neither Node nor Bun is a clear winner for the JS backend; Bun runs wasm numeric code fastest. The Node host is the supported one.
- Benchmarks of this size are noisy (about 20%); use them for orders of magnitude, not small deltas.

The first run of this suite found two real bugs, both fixed: JS `range`/`map`/etc. overflowed the stack on large
collections (`list(...array)` spread), and AS string building was quadratic in memory (`out += …` without a GC),
trapping on `(apply str …)` of 50k items. Regression tests: `test/kiso/large_test.cljs`.
