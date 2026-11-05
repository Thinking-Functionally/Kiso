# Kiso Development Memo

Session handover document. Read at session start.

## Current State

- **All 25 phases + I7 + I8 complete**. ~1500 vitest + 14 Playwright E2E, types clean.
- Var coverage: 330/330 (100%). Build: kiso ~141KB, su ~17KB. npm publish dry-run verified.
- Showcase: `showcase/`. Docs: numbered guide (001-011), unified API ref.

## Current Task

AssemblyScript backend: M0–M3 done (design `.dev/design/08-assemblyscript-backend.md`, D13–D20; code in
`packages/kiso/src/codegen-as/` and `packages/kiso/as-runtime/`). Next: M4 (`host/` + CLI target; also a real
`kiso build` that invokes asc with the `minimal`/`stub` runtime). Benchmark: `KISO_BENCH=1 npx vitest run test/bench/as-vs-js.test.ts`.

## Task Queue

1. npm publish (requires npm login to @clojurewasm org)
2. GitHub Pages deploy (CI workflow in showcase)
