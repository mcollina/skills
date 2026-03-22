---
name: build-and-test-workflow
description: The edit-build-lint-test cycle for contributing to Node.js core
metadata:
  tags: build, test, lint, workflow, contributing, make, ninja, configure
---

# Build and Test Workflow

The mandatory edit → build → lint → test cycle for Node.js core development.

## CRITICAL: You Must Rebuild After Every Code Change

**Node.js embeds its JavaScript source files into the binary at compile time.**
Changes to files in `lib/` or `src/` are NOT picked up until you rebuild.
This applies to both C++ (`src/`) and JavaScript (`lib/`) files.

```
edit src/ or lib/  →  make -j$(nproc)  →  then test
```

**There are no exceptions.** If you edit a file and run a test without
rebuilding, you are testing the OLD code. The test results are meaningless.

The `lib/` files are processed by `tools/js2c.cc` during the build and
embedded as string constants in the binary. The running `node` binary does
not read from the `lib/` directory at runtime.

### Fast JS-Only Iteration (Advanced)

If you are **only** changing `lib/` files (no C++ changes), you can configure
the build to load builtins from disk instead of the embedded copies:

```bash
./configure --node-builtin-modules-path "$(pwd)/lib"
make -j$(nproc)   # Must still build once with this flag
```

After this one-time build, changes to `lib/` files take effect immediately
without rebuilding. This does NOT work for `src/` changes — those always
require a rebuild.

**When in doubt, rebuild.** A rebuild of unchanged files is fast. Testing
against stale code wastes far more time.

## Ask the User About Their Build Setup

Before starting work on a Node.js core change, **ask the user** about their
build configuration rather than assuming one. Key questions:

- Has `./configure` already been run? With what flags?
- Are they using Make or Ninja?
- Is this a debug or release build?

Most of the time, `./configure` has already been run and you only need
`make -j$(nproc)` to rebuild.

## Build

```bash
make -j$(nproc)
```

This produces a `./node` symlink pointing to `out/Release/node`.

For configure flags (debug builds, ASan, Ninja, etc.), see
[configure.md](configure.md).

### Rebuild After Errors

If a build fails partway through:
- Fix the error
- Run `make -j$(nproc)` again — it picks up where it left off
- Only recompiles changed files and their dependents

If the build is completely broken:
```bash
make clean          # Remove object files, keep config
make -j$(nproc)     # Full rebuild

# Nuclear option — removes everything including config:
make distclean
./configure          # Must reconfigure (see configure.md for flags)
make -j$(nproc)
```

## Lint

Run linting **after** your changes build successfully but **before** pushing
or running the full test suite. This catches style issues early.

### Full Lint

```bash
make lint
```

This runs all linters: JavaScript (ESLint), C++ (cpplint), Markdown
(remark), and YAML (yamllint).

### Targeted Lint Commands

| Target              | What it checks                                    |
| ------------------- | ------------------------------------------------- |
| `make lint`         | All linters                                        |
| `make lint-js`      | JavaScript with ESLint                             |
| `make lint-js-fix`  | JavaScript with ESLint `--fix` (auto-corrects)     |
| `make lint-cpp`     | C++ with cpplint and checkimports                  |
| `make lint-md`      | Markdown with remark                               |
| `make lint-py`      | Python with ruff                                   |
| `make lint-yaml`    | YAML with yamllint                                 |

### Formatting C++ Code

After making C++ changes, format them with `clang-format`:

```bash
# First time only — install the clang-format tooling:
make format-cpp-build

# Format staged changes (default):
make format-cpp

# Format all changes on current branch vs main:
CLANG_FORMAT_START=main make format-cpp

# Format changes in the last commit:
CLANG_FORMAT_START=HEAD~1 make format-cpp
```

`make format-cpp` uses `git-clang-format` with the repo's `.clang-format`
config. It only formats the diff, not the entire codebase. Run it before
committing C++ changes.

### Formatting Markdown

```bash
make format-md
```

### Formatting JavaScript

```bash
make lint-js-fix
```

ESLint with `--fix` handles JavaScript formatting. There is no separate
format target for JS.

## Test

### The Full Test Cycle

```bash
# Build + all tests (recommended before pushing):
make test
```

`make test` does the following in order:
1. Builds node (`make all`)
2. Runs Python tool tests (`make tooltest`)
3. Builds addon test fixtures (addons, N-API, Node-API, SQLite)
4. Runs C++ tests (`make cctest`)
5. Runs JavaScript test suites (`make jstest`)

### Test Without Rebuilding Docs

```bash
make test-only
```

Same as `make test` but skips documentation build. Use this for faster
iteration when you're not changing docs.

### Running Specific Tests

**Single test file (most common during development):**

```bash
./node test/parallel/test-stream-transform.js
```

**Via the test runner (honors skip/flaky annotations):**

```bash
python3 tools/test.py parallel/test-stream-transform
```

**All tests matching a subsystem name:**

```bash
python3 tools/test.py stream     # Matches */test*-stream-*
python3 tools/test.py assert     # Matches */test*-assert-*
```

**A whole suite:**

```bash
python3 tools/test.py parallel
python3 tools/test.py sequential
```

**Multiple suites:**

```bash
python3 tools/test.py parallel sequential message
```

### Test Runner Options (`tools/test.py`)

| Option                 | Default     | Purpose                                           |
| ---------------------- | ----------- | ------------------------------------------------- |
| `-j N`                 | (all CPUs)  | Number of parallel test processes                  |
| `-m, --mode MODE`      | `release`   | `release`, `debug`, or `debug,release`             |
| `-t, --timeout SECS`   | `120`       | Timeout per test                                   |
| `--shell PATH`         | auto-detect | Path to node binary                                |
| `--node-args ARGS`     | (none)      | Extra args passed to node                          |
| `--flaky-tests ACTION` | `run`       | `run`, `skip`, `dontcare`, `keep_retrying`         |
| `-v, --verbose`        | off         | Verbose output                                     |
| `--repeat N`           | `1`         | Repeat tests N times                               |

### Specialized Test Targets

| Target                  | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `make jstest`           | JS test suites + native addon suites only        |
| `make cctest`           | C++ gtest suite only                             |
| `make test-ci`          | CI mode (JUnit XML + TAP output)                 |
| `make test-internet`    | Tests requiring network access                   |
| `make test-valgrind`    | Run tests under Valgrind                         |
| `make test-addons`      | Native addon tests                               |
| `make test-node-api`    | Node-API tests                                   |
| `make test-wpt`         | Web Platform Tests                               |
| `make test-v8`          | V8 test suite                                    |
| `make test-doc`         | Documentation tests + Markdown lint              |

### Filtering C++ Tests

```bash
# Run all C++ tests:
make cctest

# Filter to specific test(s):
out/Release/cctest --gtest_filter="*EnvironmentTest*"

# List all available C++ tests:
make list-gtests
```

## Typical Development Workflow

### For a JavaScript Change (`lib/`)

```bash
# 1. Make your changes to lib/
$EDITOR lib/internal/streams/transform.js

# 2. Rebuild (MANDATORY — JS is embedded in the binary)
make -j$(nproc)

# 3. Lint JavaScript
make lint-js

# 4. Run the relevant test(s)
./node test/parallel/test-stream-transform.js

# 5. Before pushing, run broader tests
make test-only
```

### For a C++ Change (`src/`)

```bash
# 1. Make your changes to src/
$EDITOR src/node_options.cc

# 2. Rebuild (MANDATORY)
make -j$(nproc)

# 3. Format C++
make format-cpp

# 4. Lint C++
make lint-cpp

# 5. Run the relevant test(s)
./node test/parallel/test-cli-options.js

# 6. Run C++ tests if you touched testable C++
make cctest

# 7. Before pushing, run broader tests
make test-only
```

### For a Mixed Change (`src/` + `lib/` + `doc/`)

```bash
# 1. Make all changes
$EDITOR src/node_options.h src/node_options.cc
$EDITOR lib/internal/process/pre_execution.js
$EDITOR doc/api/cli.md

# 2. Rebuild (MANDATORY)
make -j$(nproc)

# 3. Format and lint
make format-cpp
make lint

# 4. Run targeted tests
./node test/parallel/test-your-feature.js

# 5. Full test run
make test
```

## Common Mistakes

### Testing without rebuilding

```bash
# WRONG — tests the old binary, not your changes:
$EDITOR lib/internal/streams/transform.js
./node test/parallel/test-stream-transform.js    # ← STALE CODE

# CORRECT:
$EDITOR lib/internal/streams/transform.js
make -j$(nproc)                                   # ← REBUILD FIRST
./node test/parallel/test-stream-transform.js
```

### Forgetting to format C++ before committing

```bash
# The CI will reject unformatted C++ code.
# Always run after C++ changes:
make format-cpp-build   # first time only
make format-cpp
```

### Running `make test` without `make` first

`make test` includes a build step (`all`), so it will rebuild automatically.
But `make test-only` does too. The only case where you'd test stale code is
running `./node test/...` directly without rebuilding first.

### Confusing `make` and `ninja` after `--ninja`

If you configured with `--ninja`, you still use `make` for all higher-level
targets. The Makefile invokes Ninja internally for the compilation step.

```bash
# Both are fine after ./configure --ninja:
make -j$(nproc)
ninja -C out/Release

# All higher-level targets still use make:
make test        # ✓ works
make lint        # ✓ works
make format-cpp  # ✓ works
```

## References

- Build instructions: `BUILDING.md` in the Node.js repo
- Makefile: `Makefile` in the repo root
- Test runner: `tools/test.py`
- Configure: `configure.py`
