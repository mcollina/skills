---
name: cli-options
description: Adding CLI options and gating experimental modules in Node.js core
metadata:
  tags: cli, options, experimental, module-gating, nodejs-core
---

# CLI Options and Experimental Module Gating

How to add new CLI flags to Node.js core and use them to gate access to experimental built-in modules.

## CLI Option Lifecycle

```
src/node_options.h          Declare member on the appropriate Options class
        │
src/node_options.cc         Register with AddOption() in the matching parser constructor
        │
lib/internal/options.js     getOptionValue('--flag-name') bridges C++ → JS (all classes)
        │
lib/internal/process/       setupXxx() checks flag at startup,
  pre_execution.js          calls BuiltinModule.allowRequireByUsers()
        │
lib/internal/bootstrap/     experimentalModuleList + schemelessBlockList
  realm.js                  control default visibility
        │
doc/api/cli.md              Document the flag with YAML metadata
doc/node.1                  Man page entry (nroff format)
```

## C++ Option Definition

### Option classes (`src/node_options.h`)

There are four option classes, each scoped to a different lifetime. The classes
nest: `PerProcess` contains a `PerIsolate`, which contains an `Environment`,
which contains `Debug`.

| Class                  | Scope                          | Parser constructor in `node_options.cc` | Typical use                               |
| ---------------------- | ------------------------------ | --------------------------------------- | ----------------------------------------- |
| `DebugOptions`         | Inspector/debugging            | `DebugOptionsParser::DebugOptionsParser()` | `--inspect`, `--inspect-brk`, `--inspect-port` |
| `EnvironmentOptions`   | Per Environment (most common)  | `EnvironmentOptionsParser::EnvironmentOptionsParser()` | `--experimental-*`, module flags, `--eval` |
| `PerIsolateOptions`    | Per V8 isolate                 | `PerIsolateOptionsParser::PerIsolateOptionsParser(...)` | `--track-heap-objects`, `--stack-trace-limit`, V8 flags |
| `PerProcessOptions`    | Once per process, set at start | `PerProcessOptionsParser::PerProcessOptionsParser(...)` | `--title`, `--v8-pool-size`, `--security-revert` |

**Choosing the right class:**

- **Module-gating flags** (e.g., `--experimental-sqlite`) → `EnvironmentOptions`
- **Inspector/debugger flags** → `DebugOptions`
- **Flags that affect V8 isolate configuration** → `PerIsolateOptions`
- **Flags that must be set once for the entire process** → `PerProcessOptions`
  (see the comment in `node_options.h`: "Options shouldn't be here unless they
  affect the entire process scope, and that should be avoided when possible.")

### Declare the option (`src/node_options.h`)

Add a member to the chosen class:

```cpp
// EnvironmentOptions — most experimental flags go here
class EnvironmentOptions : public Options {
 public:
  bool experimental_foo = false;   // Default OFF (opt-in)
  bool experimental_sqlite = true; // Default ON (opt-out)
};

// PerIsolateOptions — V8 isolate-scoped options
class PerIsolateOptions : public Options {
 public:
  bool track_heap_objects = false;
  bool experimental_shadow_realm = false;
};

// PerProcessOptions — process-wide, avoid when possible
class PerProcessOptions : public Options {
 public:
  std::string title;
  int64_t v8_thread_pool_size = 4;
};

// DebugOptions — inspector only
class DebugOptions : public Options {
 public:
  bool inspector_enabled = false;
  HostPort host_port{"127.0.0.1", kDefaultInspectorPort};
};
```

### Register the option (`src/node_options.cc`)

Each option class has its own parser constructor. **You must register the
option in the constructor that matches the class you declared it on.**

```
DebugOptionsParser::DebugOptionsParser()                      → DebugOptions members
EnvironmentOptionsParser::EnvironmentOptionsParser()          → EnvironmentOptions members
PerIsolateOptionsParser::PerIsolateOptionsParser(eop)         → PerIsolateOptions members
PerProcessOptionsParser::PerProcessOptionsParser(iop)         → PerProcessOptions members
```

The parsers nest via `Insert()` calls, so the hierarchy is:
`PerProcess` → `PerIsolate` → `Environment` → `Debug`.

**Registration examples:**

```cpp
// In EnvironmentOptionsParser::EnvironmentOptionsParser():
// Default OFF — user must pass --experimental-foo
AddOption("--experimental-foo",
          "experimental foo module",
          &EnvironmentOptions::experimental_foo,
          kAllowedInEnvvar);

// Default ON — user can pass --no-experimental-sqlite to disable
AddOption("--experimental-sqlite",
          "experimental node:sqlite module",
          &EnvironmentOptions::experimental_sqlite,
          kAllowedInEnvvar,
          true);    // default_is_true → help text shows --no-* variant

// In PerIsolateOptionsParser::PerIsolateOptionsParser(eop):
AddOption("--track-heap-objects",
          "track heap object allocations for heap snapshots",
          &PerIsolateOptions::track_heap_objects,
          kAllowedInEnvvar);

// In PerProcessOptionsParser::PerProcessOptionsParser(iop):
AddOption("--title",
          "the process title to use on startup",
          &PerProcessOptions::title,
          kAllowedInEnvvar);

// In DebugOptionsParser::DebugOptionsParser():
AddOption("--inspect",
          "activate inspector on host:port (default: 127.0.0.1:9229)",
          &DebugOptions::inspector_enabled,
          kAllowedInEnvvar);
```

**`AddOption` parameters:**

| Parameter          | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `name`             | CLI flag string, e.g. `"--experimental-foo"`                       |
| `help_text`        | Shown in `node --help`                                             |
| `field`            | Pointer-to-member on the matching class                            |
| `env_setting`      | `kAllowedInEnvvar` (can set via `NODE_OPTIONS`) or `kDisallowedInEnvvar` |
| `default_is_true`  | When `true`, help text advertises the `--no-*` variant             |

Node.js automatically generates `--no-*` negation variants for all boolean flags.

### Accessing options from C++

The access pattern differs by class:

```cpp
// EnvironmentOptions — via Environment pointer
env->options()->experimental_foo

// PerIsolateOptions — via Isolate data
isolate_data->options()->track_heap_objects

// PerProcessOptions — via global singleton (requires mutex for post-init access)
Mutex::ScopedLock lock(per_process::cli_options_mutex);
per_process::cli_options->per_isolate->per_env->experimental_foo

// DebugOptions — nested inside EnvironmentOptions
env->options()->get_debug_options()->inspector_enabled
```

## JavaScript-Side Flag Checking

### Reading option values

```javascript
// lib/internal/options.js exposes:
const { getOptionValue } = require('internal/options');

// Returns the value of the flag regardless of which C++ class it's on.
// getOptionValue() calls getCLIOptionsValues() from internalBinding('options'),
// which serializes all option values from all four classes into a single dict.
getOptionValue('--experimental-foo');  // true or false
getOptionValue('--inspect');           // works for DebugOptions too
getOptionValue('--title');             // works for PerProcessOptions too
```

### Setup function pattern (`lib/internal/process/pre_execution.js`)

Add a `setupXxx()` function called from `prepareExecution()`:

**Pattern A — Default OFF (opt-in):**

```javascript
function setupFoo() {
  if (!getOptionValue('--experimental-foo')) {
    return;  // Not enabled, don't allow
  }
  const { BuiltinModule } = require('internal/bootstrap/realm');
  BuiltinModule.allowRequireByUsers('foo');
}
```

**Pattern B — Default ON (opt-out):**

```javascript
function setupSQLite() {
  if (getOptionValue('--no-experimental-sqlite')) {
    return;  // User explicitly disabled it
  }
  const { BuiltinModule } = require('internal/bootstrap/realm');
  BuiltinModule.allowRequireByUsers('sqlite');
}
```

Call the setup function from `prepareExecution()`:

```javascript
function prepareExecution(options) {
  // ... existing setup calls ...
  setupFoo();   // Add alongside setupSQLite(), setupQuic(), etc.
}
```

## Module Gating via `realm.js`

### Key data structures (`lib/internal/bootstrap/realm.js`)

**IMPORTANT:** When adding a new experimental module, always ask whether it
should require the `node:` prefix or also be available as a bare specifier
(e.g., `require('foo')` vs only `require('node:foo')`). This determines
whether the module needs to be added to `schemelessBlockList`. Not all
experimental modules require the prefix.

```javascript
// Modules excluded from public list by default (require flag to enable):
const experimentalModuleList = new SafeSet(['sqlite', 'quic', 'foo']);

// Modules that require the node: prefix (cannot use bare specifier).
// Only add the module here if bare-specifier access should be blocked.
const schemelessBlockList = new SafeSet([
  'sea', 'sqlite', 'quic', 'test', 'test/reporters',
  // 'foo',   // Add here ONLY if node:foo prefix is required
]);
```

**`experimentalModuleList`** → excluded from `publicBuiltinIds` → not in
`canBeRequiredByUsersList` until `allowRequireByUsers()` is called.

**`schemelessBlockList`** → excluded from `canBeRequiredByUsersWithoutSchemeList` →
`require('foo')` won't work, must use `require('node:foo')`.
If the module is **not** in this list, both `require('foo')` and
`require('node:foo')` will work once the flag is enabled.

### How resolution works

```javascript
// lib/internal/bootstrap/realm.js
static normalizeRequirableId(id) {
  if (StringPrototypeStartsWith(id, 'node:')) {
    const normalizedId = StringPrototypeSlice(id, 5);
    if (BuiltinModule.canBeRequiredByUsers(normalizedId)) {
      return normalizedId;     // ✅ allowed
    }
  } else if (BuiltinModule.canBeRequiredWithoutScheme(id)) {
    return id;                 // ✅ allowed (not in schemelessBlockList)
  }
  return undefined;            // ❌ blocked → ERR_UNKNOWN_BUILTIN_MODULE
}
```

### `allowRequireByUsers()` — Runtime enablement

```javascript
static allowRequireByUsers(id) {
  canBeRequiredByUsersList.add(id);
  if (!schemelessBlockList.has(id)) {
    canBeRequiredByUsersWithoutSchemeList.add(id);
  }
}
```

## C++ Module Categorization (`src/node_builtins.cc`)

Add the module ID to `cannot_be_required` in `GetBuiltinCategories()`:

```cpp
builtin_categories.cannot_be_required = std::set<std::string> {
  // ...
  "foo",     // Experimental.
  "quic",    // Experimental.
  "sqlite",  // Experimental.
  // ...
};
```

This ensures the C++ layer also blocks access independently of the JS layer.

## Subpath Module Mechanics

Subpath modules like `stream/web`, `test/reporters`, `fs/promises` use the
**same gating system** as top-level modules. The `/` is part of the module ID,
not a path separator.

### Module ID derivation (`tools/js2c.cc`)

The build tool `js2c` converts file paths to module IDs by stripping `lib/`
and `.js`:

```
lib/foo.js          →  foo
lib/stream/web.js   →  stream/web
lib/fs/promises.js  →  fs/promises
```

No explicit mapping table exists. The file's existence under `lib/` and a
rebuild is all that's needed for the module ID to appear in `builtinIds`.

### config.gypi

The `configure.py` script auto-discovers all `.js` files under `lib/` and writes
them into `config.gypi`. You never need to manually edit `config.gypi`.

## Entry Point Pattern

The entry point file (e.g., `lib/foo.js`) can optionally emit an
experimental warning:

```javascript
'use strict';
const { emitExperimentalWarning } = require('internal/util');
emitExperimentalWarning('foo');
// ... module implementation ...
```

No flag checking is needed in the entry point itself — all gating happens in
the module resolution layer.

## Documentation

### `doc/api/cli.md`

**IMPORTANT:** Both the subsection headings and the `NODE_OPTIONS` allowlist
in `cli.md` must be in strict alphabetical order. Two tests enforce this:

- `test/parallel/test-cli-node-options-docs.js` — verifies subsection headings
  are alphabetically ordered
- `test/parallel/test-process-env-allowed-flags-are-documented.js` — verifies
  the `NODE_OPTIONS` allowlist matches runtime flags and is sorted

Both tests will fail if entries are out of order.

Add a subsection heading in alphabetical position:

```markdown
### `--experimental-foo`

<!-- YAML
added: REPLACEME
-->

Enable the experimental [`node:foo`][] module.
```

Also add to the `NODE_OPTIONS` allowlist section in alphabetical position
(between the `<!-- node-options-node start -->` and
`<!-- node-options-node end -->` comments).

```markdown
<!-- node-options-node start -->
* `--experimental-foo`
```

### `doc/node.1` (man page, nroff format)

```nroff
.It Fl -experimental-foo
Enable the experimental
.Sy node:foo
module.
```

## Test Patterns

### Test with `// Flags:` directive

```javascript
// Flags: --experimental-foo
'use strict';
require('../common');
const foo = require('node:foo');
// ... test the module ...
```

### Test that import fails without the flag

```javascript
'use strict';
const { spawnPromisified } = require('../common');
const assert = require('assert');
const { describe, it } = require('node:test');

describe('foo gating', () => {
  it('fails without --experimental-foo', async () => {
    const { stderr, code } = await spawnPromisified(process.execPath, [
      '-e', 'require("node:foo")',
    ]);
    assert.match(stderr, /No such built-in module: node:foo/);
    assert.notStrictEqual(code, 0);
  });
});
```

## Complete Checklist

| Step | File | Change |
| ---- | ---- | ------ |
| 1 | `src/node_options.h` | Add member to the appropriate class (`EnvironmentOptions` for module flags) |
| 2 | `src/node_options.cc` | Register with `AddOption()` in the **matching parser constructor** |
| 3 | `src/node_builtins.cc` | Add to `cannot_be_required` in `GetBuiltinCategories()` (module gating only) |
| 4 | `lib/internal/bootstrap/realm.js` | Add to `experimentalModuleList` and `schemelessBlockList` (module gating only) |
| 5 | `lib/internal/process/pre_execution.js` | Add `setupXxx()` checking the flag (module gating only) |
| 6 | `lib/yourmod.js` | Optionally call `emitExperimentalWarning()` |
| 7 | `doc/api/cli.md` | Document flag + add to `NODE_OPTIONS` allowlist |
| 8 | `doc/node.1` | Man page entry |
| 9 | `test/parallel/` | Flag-enabled tests + flag-disabled gating test |

Steps 3–5 apply specifically to module-gating flags. General-purpose flags
(e.g., a new `PerProcessOptions` flag) only need steps 1, 2, 7, 8, 9.

## References

- Option parsing: `src/node_options.h`, `src/node_options.cc`
- JS bridge: `lib/internal/options.js`
- Module gating: `lib/internal/bootstrap/realm.js`
- Startup setup: `lib/internal/process/pre_execution.js`
- C++ categories: `src/node_builtins.cc` (`GetBuiltinCategories`)
- Module ID derivation: `tools/js2c.cc` (`GetFileId`)
