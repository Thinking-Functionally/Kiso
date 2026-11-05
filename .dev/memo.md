# Kiso Development Memo

Session handover document. Read at session start.

## Current State

- **All 25 phases + I7 + I8 complete**. ~1500 vitest + 14 Playwright E2E, types clean.
- Var coverage: 330/330 (100%). Build: kiso ~141KB, su ~17KB. npm publish dry-run verified.
- Showcase: `showcase/`. Docs: numbered guide (001-011), unified API ref.

## Current Task

AssemblyScript backend, M2 (vertical slice): `runtime-as/` skeleton + `emitter-as.ts` for
`defn`/arithmetic/`if`/`let`/`loop`/`println`, run on Node, differential test + benchmark harness.
M0/M1 done (design `.dev/design/08-assemblyscript-backend.md`, decisions D13–D17, lowering pass in
`packages/kiso/src/codegen-as/`). Needs `assemblyscript` (asc) as a dev dependency.

## Task Queue

1. npm publish (requires npm login to @clojurewasm org)
2. GitHub Pages deploy (CI workflow in showcase)
