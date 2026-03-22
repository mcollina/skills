---
name: configure
description: The ./configure script — when to run it and common flags
metadata:
  tags: configure, build, flags, debug, asan, ninja
---

# Configure (`./configure`)

Running `./configure` is **not** part of the regular edit-build-test cycle.
You only need to run it when:

- **First time building** from a fresh checkout
- **Adding new JavaScript files** in `lib/` (configure auto-discovers them)
- **Changing build-time flags** (e.g., switching to a debug build)

If `./configure` has already been run, you only need `make -j$(nproc)` to
rebuild after code changes. See
[build-and-test-workflow.md](build-and-test-workflow.md) for the full cycle.

## Common Examples

```bash
# Typical development setup:
./configure

# Debug build (enables DCHECKs, slower but catches more bugs):
./configure --debug

# With debug symbols on release build (good for profiling):
./configure --debug-symbols

# With Address Sanitizer:
./configure --enable-asan

# Quick JS iteration (loads lib/ from disk, no rebuild needed for lib/ changes):
./configure --node-builtin-modules-path "$(pwd)/lib"

# Use Ninja instead of Make (optional, faster incremental builds):
./configure --ninja
```

## Flag Reference

### Debug and Diagnostics

| Flag                   | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `--debug`              | Build debug binary (`./node_g`) with DCHECKs enabled       |
| `--debug-symbols`      | Add `-g` to release build (profiling without DCHECKs)       |
| `--debug-node`         | Debug symbols for just the Node.js part (not V8/deps)       |
| `--v8-with-dchecks`    | Enable V8 debug checks without full debug build             |
| `--v8-non-optimized-debug` | Compile V8 with minimal optimizations and runtime checks |
| `--v8-enable-object-print` | V8 auxiliary functions for native debuggers              |
| `--gdb`                | Add gdb support                                             |
| `--enable-asan`        | Build with AddressSanitizer                                 |
| `--enable-ubsan`       | Build with UndefinedBehaviorSanitizer                       |
| `--coverage`           | Build with code coverage enabled                            |
| `--error-on-warn`      | Turn compiler warnings into errors                          |

### Build Configuration

| Flag                              | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `--ninja`                         | Use Ninja instead of Make (faster incremental builds)      |
| `--enable-lto`                    | Enable link-time optimization                              |
| `--prefix PREFIX`                 | Install prefix (default: `/usr/local`)                     |

### Feature Flags

| Flag                              | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `--node-builtin-modules-path DIR` | Load `lib/` builtins from disk instead of embedded copies  |
| `--without-npm`                   | Skip npm (faster build if you don't need it)               |
| `--without-ssl`                   | Build without SSL                                          |
| `--without-inspector`             | Disable the V8 inspector protocol                          |
| `--without-node-snapshot`         | Disable V8 snapshot (useful for debugging startup)         |
| `--without-node-code-cache`       | Disable V8 code cache                                      |
| `--without-intl`                  | Build without ICU (smaller binary)                         |
| `--experimental-quic`             | Build with experimental QUIC support                       |

### Cross-Compilation

| Flag                | Purpose                             |
| ------------------- | ----------------------------------- |
| `--dest-cpu=ARCH`   | Target CPU (e.g., `arm64`, `x64`)   |
| `--dest-os=OS`      | Target OS (e.g., `linux`, `mac`)    |
| `--cross-compiling` | Enable cross-compilation mode       |

## Debug Build

```bash
./configure --debug
make -j$(nproc)
```

This produces both `./node` (release) and `./node_g` (debug, symlink to
`out/Debug/node`). Use `./node_g` for debugging with gdb/lldb. It has
DCHECKs enabled and is unoptimized — slower but catches bugs that release
builds miss.

## When You Must Reconfigure

After running `./configure`, the config is stored in `config.gypi` and
`config.mk`. You do **not** need to reconfigure when:

- Editing existing `src/` or `lib/` files — just `make -j$(nproc)`
- Editing `doc/` files
- Editing test files

You **do** need to reconfigure when:

- Adding new `lib/*.js` files (configure discovers them for `js2c`)
- Switching between release and debug builds
- Changing any build-time flag
- After running `make distclean` (which removes the config)

## References

- `./configure --help` for the full list of flags
- `BUILDING.md` in the Node.js repo
- `configure.py` source
