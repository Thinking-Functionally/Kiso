import { registerWasm } from '@clojurewasm/kiso/runtime';
import { readFileSync } from 'node:fs';
await registerWasm('fixture', readFileSync("/Users/Shared/Relocated_Items/Security/eUSB/sync/zig/projects/kiso/packages/kiso/test/fixtures/ffi_fixture.wasm"));
export const mod = await import("/Users/Shared/Relocated_Items/Security/eUSB/sync/zig/projects/kiso/packages/kiso/bench/.out-ffi/js-ffi_call/ffi_call.js");
