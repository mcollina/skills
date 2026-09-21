---
name: nodejs-native-debug
description: Diagnoses native crashes and memory leaks in Node.js. Use when a Node process segfaults or aborts, when debugging a C++ addon or core binary under gdb or lldb, when reading a native backtrace, or when hunting a memory leak with heap snapshots, valgrind, or ASan.
metadata:
  tags: segfault, crash, gdb, lldb, backtrace, core-dump, memory-leak, heap-snapshot, valgrind, asan, native-debugging
---

## Decision trees

**Segfault or abort in a native addon**

1. Reproducible under `gdb --args node ...`? Run, then capture `bt`.
2. Backtrace points at a V8 handle? Check `HandleScope` /
   `EscapableHandleScope` lifetime in the addon.
3. Backtrace points at a libuv callback? Inspect async handle lifetime and
   `uv_close()` sequencing.
4. No clear C++ frame? Look for JS-side type mismatches passed into the
   binding.

Confirm the backtrace shows the expected call site *before* applying a fix — a
backtrace into freed memory usually means the real bug is one step earlier.

**Suspected memory leak**

1. Is it JS heap or native? `process.memoryUsage()`: growing `heapUsed` is JS,
   growing `rss` with flat `heapUsed` is native or external.
2. JS heap → two heap snapshots under load, compare retained sizes.
3. Native → `valgrind --leak-check=full node addon_test.js`, or an ASan build.
4. Confirm the leak is gone by re-running the same comparison, not by
   eyeballing `rss`.

## Rules

- [rules/debugging-native.md](rules/debugging-native.md) — gdb, lldb, debugging C++ addons and the core binary
- [rules/memory-debugging.md](rules/memory-debugging.md) — heap snapshots, leak detection, comparing allocations

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Buffer and external-memory lifetimes in addon code → **nodejs-addons**
- Deoptimization and CPU profiling rather than crashes → **nodejs-v8-perf**
- Producing a debug or ASan build → **nodejs-build**
