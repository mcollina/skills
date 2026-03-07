---
name: node
description: Provides Node.js best practices for TypeScript with type stripping, error handling, streams, testing, and performance. Use when writing or reviewing Node.js backend code.
metadata:
  tags: node, nodejs, javascript, typescript, type-stripping, backend, server
---

## When to use

Use this skill whenever you are dealing with Node.js code to obtain domain-specific knowledge for building robust, performant, and maintainable Node.js applications.

## TypeScript with Type Stripping

When writing TypeScript for Node.js, use **type stripping** (Node.js 22.6+) instead of build tools like ts-node or tsx. Type stripping runs TypeScript directly by removing type annotations at runtime without transpilation.

Key requirements for type stripping compatibility:
- Use `import type` for type-only imports
- Use const objects instead of enums
- Avoid namespaces and parameter properties
- Use `.ts` extensions in imports

See [rules/typescript.md](rules/typescript.md) for complete configuration and examples.

## How to use

Read individual rule files for detailed explanations and code examples:

- [rules/error-handling.md](rules/error-handling.md) - Error handling patterns in Node.js
- [rules/async-patterns.md](rules/async-patterns.md) - Async/await and Promise patterns
- [rules/streams.md](rules/streams.md) - Working with Node.js streams
- [rules/modules.md](rules/modules.md) - ES Modules and CommonJS patterns
- [rules/testing.md](rules/testing.md) - Testing strategies for Node.js applications
- [rules/flaky-tests.md](rules/flaky-tests.md) - Identifying and diagnosing flaky tests with node:test
- [rules/node-modules-exploration.md](rules/node-modules-exploration.md) - Navigating and analyzing node_modules directories
- [rules/performance.md](rules/performance.md) - Performance optimization techniques
- [rules/caching.md](rules/caching.md) - Caching patterns and libraries
- [rules/profiling.md](rules/profiling.md) - Profiling and benchmarking tools
- [rules/logging.md](rules/logging.md) - Logging and debugging patterns
- [rules/environment.md](rules/environment.md) - Environment configuration and secrets management
- [rules/graceful-shutdown.md](rules/graceful-shutdown.md) - Graceful shutdown and signal handling
- [rules/typescript.md](rules/typescript.md) - TypeScript configuration and type stripping in Node.js
