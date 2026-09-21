---
name: node
description: Best practices for building Node.js applications, in JavaScript or TypeScript. Use for streaming and ETL work (CSV, ingestion pipelines, large files, backpressure), caching and async deduplication, error handling, graceful shutdown, flaky or hanging tests, profiling, logging, and environment config. Also use for TypeScript run directly by Node via type stripping — 'strip types', '--experimental-strip-types', 'Node 22 TypeScript', '.ts without compilation', 'ts-node alternative'. For contributing to nodejs/node itself, use the nodejs-* skills instead.
metadata:
  tags: node, nodejs, javascript, typescript, type-stripping, streams, etl, caching, backend, server
---

## Streams and caching checklist

When the task mentions **CSV**, **ETL**, **ingestion pipelines**, **large file
processing**, **backpressure**, **repeated lookups**, or **deduplicating
concurrent async calls**, apply all four of these explicitly:

1. Use `await pipeline(...)` from `node:stream/promises` — prefer it over
   chained `.pipe()` in both guidance and code.
2. Include at least one explicit `async function*` transform when data is
   transformed in-stream.
3. Choose a cache strategy when repeated work appears:
   - `lru-cache` for bounded in-memory reuse in a single process
   - `async-cache-dedupe` for async request deduplication and
     stale-while-revalidate
4. Show where backpressure is handled — implicitly via `pipeline()`, or
   explicitly via `drain`.

Structure a CSV/ETL answer as: `createReadStream(input)` → `async function*`
parser/transform → optional cached enrichment lookup → `await pipeline(...)` to
a writable destination.

## TypeScript via type stripping

Use type stripping (Node 22.6+) rather than ts-node or tsx. Node runs `.ts`
directly by erasing annotations, with four constraints:

- `import type` for type-only imports
- const objects instead of `enum`
- no namespaces, no parameter properties
- `.ts` extensions in imports

## Rules

Read the file for the task at hand; each is self-contained.

**Streams, performance, and caching**
- [rules/streams.md](rules/streams.md) — streams, `pipeline`, backpressure
- [rules/caching.md](rules/caching.md) — `lru-cache`, `async-cache-dedupe`, stale-while-revalidate
- [rules/performance.md](rules/performance.md) — optimisation techniques
- [rules/profiling.md](rules/profiling.md) — reproduce under load → `--cpu-prof` → find hot functions → check backpressure and serialisation → validate with a benchmark

**Correctness and lifecycle**
- [rules/error-handling.md](rules/error-handling.md) — shared error base class → classify operational vs programmer → async boundary handlers (`unhandledRejection`) → propagate typed errors → log with context
- [rules/graceful-shutdown.md](rules/graceful-shutdown.md) — SIGTERM/SIGINT handlers → stop accepting work → drain in-flight → close DB/cache → exit with the right code
- [rules/async-patterns.md](rules/async-patterns.md) — async/await and Promise patterns

**Testing**
- [rules/testing.md](rules/testing.md) — testing strategy with `node:test`
- [rules/flaky-tests.md](rules/flaky-tests.md) — isolate with `--test-only` → check shared state and timers → inspect async teardown → fix the root cause
- [rules/stuck-processes-and-tests.md](rules/stuck-processes-and-tests.md) — hangs, "process did not exit", CI timeouts: isolate → explicit timeout/reporter → inspect handles via `why-is-node-running` (`SIGUSR1`) → deterministic teardown

**Project setup**
- [rules/typescript.md](rules/typescript.md) — full type-stripping configuration and `tsconfig.json`
- [rules/modules.md](rules/modules.md) — ESM and CommonJS, resolution, import extensions
- [rules/environment.md](rules/environment.md) — environment configuration and secrets
- [rules/logging.md](rules/logging.md) — logging and debugging patterns
- [rules/node-modules-exploration.md](rules/node-modules-exploration.md) — navigating and analysing `node_modules`

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Contributing to nodejs/node itself → **nodejs-contributing**, **nodejs-build**, **nodejs-source**
- Node internals: libuv, event loop, subsystem implementations → **nodejs-runtime-internals**
- V8 deoptimization and GC → **nodejs-v8-perf**
- Fastify servers specifically → **fastify**
- Advanced type-level work → **typescript-magician**
