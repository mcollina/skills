---
name: nodejs-addons
description: Builds native Node.js addons with N-API and node-addon-api. Use when writing C++ addons, setting up binding.gyp, choosing between N-API and NAN, handling async work with AsyncWorker or napi_async_work, managing external memory and Buffer lifetimes, or fixing ABI compatibility problems across Node versions.
metadata:
  tags: napi, node-addon-api, native-addons, cpp, binding-gyp, abi-stability, async-worker, external-memory, node-gyp
---

## Non-negotiables

1. **Prefer N-API (or node-addon-api) over raw V8 and NAN for new addons.**
   N-API is ABI-stable across Node major versions; V8 API addons must be
   recompiled and often rewritten for every major.
2. **Never block the event loop in a synchronous binding.** Long or blocking
   work belongs in `napi_async_work` / `Napi::AsyncWorker`, which runs on the
   libuv thread pool.
3. **Account for external memory.** Buffers and allocations owned by the addon
   are invisible to V8's heap accounting unless you report them, so GC pressure
   never rises and the process grows until the OS kills it.

## Rules

- [rules/napi.md](rules/napi.md) — N-API development, ABI stability, async workers
- [rules/node-addon-api.md](rules/node-addon-api.md) — C++ wrapper patterns and best practices
- [rules/native-memory.md](rules/native-memory.md) — Buffer handling, external memory, preventing leaks

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Segfaults, gdb/lldb, and leak hunting in an addon → **nodejs-native-debug**
- V8 handle scopes and GC behavior → **nodejs-v8-perf**
- Building Node itself rather than an addon → **nodejs-build**
