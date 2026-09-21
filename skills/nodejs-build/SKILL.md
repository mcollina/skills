---
name: nodejs-build
description: Builds, configures, and tests the Node.js runtime from source. Use when running ./configure, compiling nodejs/node with make or ninja, diagnosing gyp or linker failures, setting up a debug or ASan build, cross-compiling, or running the core test suite with tools/test.py.
metadata:
  tags: nodejs-core, build, configure, make, ninja, gyp, compilation, test-suite, asan, cross-compile
---

## Non-negotiables

1. **Rebuild after any change to `src/` or `lib/`.** Node.js embeds `lib/`
   JavaScript into the binary at compile time via `js2c`. Without a rebuild,
   tests run against stale code and the results are meaningless.

   ```
   edit src/ or lib/  →  make -j$(nproc)  →  make lint  →  then test
   ```

   Never run `./node test/...` after editing without building first.

2. **Ask the user about their build configuration before starting.** Make vs
   Ninja, debug vs release, which `./configure` flags. Do not assume. Most of
   the time `./configure` has already been run and only `make -j$(nproc)` is
   needed.

3. **`make test` runs no linters on Unix.** A green test run says nothing about
   whether the `Linters` CI job will pass.

## Rules

- [rules/build-and-test-workflow.md](rules/build-and-test-workflow.md) — the edit-build-lint-test cycle, test runner invocations, and which targets to use
- [rules/configure.md](rules/configure.md) — `./configure` flags for debug builds, ASan, Ninja, shared libraries
- [rules/build-system.md](rules/build-system.md) — gyp, ninja, make, cross-platform compilation, linker errors

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Lint gate and commit validation before pushing → **nodejs-contributing**
- Writing the code being built (`lib/`, `src/`) → **nodejs-source**
- `binding.gyp` for third-party native addons rather than core → **nodejs-addons**
- Debugging a crash in the resulting binary → **nodejs-native-debug**
