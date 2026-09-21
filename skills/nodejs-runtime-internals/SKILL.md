---
name: nodejs-runtime-internals
description: Explains how Node.js subsystems are implemented internally. Use when reasoning about libuv event loop phases, thread pool saturation or UV_THREADPOOL_SIZE, blocked or starved I/O, or how streams, net, fs, crypto, child_process, or worker_threads are actually implemented beneath the JavaScript API.
metadata:
  tags: nodejs-core, libuv, event-loop, thread-pool, streams, net, fs, crypto, child-process, worker-threads, internals
---

## How to use this skill

This is reference material, one subsystem per file. **Read only the file for
the subsystem in question.** These files are long and independent; loading
several at once costs a great deal of context and rarely answers the question
faster. They are immutable and on disk, so it is always cheap to come back for
another one.

If the question is "why is this slow" rather than "how does this work", start
with **nodejs-v8-perf** instead — most performance questions are answered by a
profile, not by implementation detail.

## Event loop and I/O

- [rules/libuv-event-loop.md](rules/libuv-event-loop.md) — phases, timers, pending callbacks, poll, check, close
- [rules/libuv-thread-pool.md](rules/libuv-thread-pool.md) — pool sizing, `UV_THREADPOOL_SIZE`, which operations block
- [rules/libuv-async-io.md](rules/libuv-async-io.md) — handles vs requests, async I/O patterns

## Core module implementations

- [rules/streams-internals.md](rules/streams-internals.md) — streams at the C++ level, backpressure machinery
- [rules/net-internals.md](rules/net-internals.md) — TCP/UDP implementation, socket handling
- [rules/fs-internals.md](rules/fs-internals.md) — libuv fs operations, sync vs async cost
- [rules/crypto-internals.md](rules/crypto-internals.md) — OpenSSL integration and its performance characteristics
- [rules/child-process-internals.md](rules/child-process-internals.md) — IPC, spawn, fork implementation
- [rules/worker-threads-internals.md](rules/worker-threads-internals.md) — SharedArrayBuffer, Atomics, MessageChannel

## Quick triage

| Symptom | Start with |
| --- | --- |
| Event loop lag under load | `libuv-event-loop.md`, then `libuv-thread-pool.md` |
| `fs` or `crypto` calls serialising unexpectedly | `libuv-thread-pool.md` |
| Memory growth on a piped stream | `streams-internals.md` |
| IPC messages dropped or reordered | `child-process-internals.md` |
| Worker startup cost or transfer semantics | `worker-threads-internals.md` |

```bash
node --trace-event-categories v8,node,node.async_hooks script.js
```

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Deoptimization, GC, CPU profiling → **nodejs-v8-perf**
- Crashes and leaks in native code → **nodejs-native-debug**
- Changing these subsystems rather than understanding them → **nodejs-source**
