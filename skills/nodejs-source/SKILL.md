---
name: nodejs-source
description: Writes JavaScript and C++ inside the nodejs/node tree. Use when editing lib/ or lib/internal/ modules, applying primordials to avoid prototype pollution, adding a new CLI flag or --experimental option, gating an experimental module, or wiring a new option through src/node_options.cc.
metadata:
  tags: nodejs-core, primordials, prototype-pollution, lib-internal, cli-options, node-options, experimental-flags, source
---

## Non-negotiables

1. **Use primordials in `lib/internal/`.** Code in internal modules must not
   depend on mutable global prototypes; user code can replace them and change
   Node's own behavior. This is a correctness and security requirement, not a
   style rule. See [rules/primordials.md](rules/primordials.md) for which
   constructs need replacing and the exceptions.

2. **Rebuild after editing `lib/` or `src/`.** `js2c` embeds `lib/` into the
   binary at compile time, so an unbuilt change is invisible to tests.

3. **New CLI options need more than a parser entry.** An option is not done
   until it is wired through `src/node_options.cc`, documented in
   `doc/api/cli.md`, and covered by a test. Experimental features must be
   gated and emit the standard experimental warning.

## Rules

- [rules/primordials.md](rules/primordials.md) — using primordials in internal modules to prevent prototype pollution
- [rules/cli-options.md](rules/cli-options.md) — adding CLI options and gating experimental modules

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Building and testing the change → **nodejs-build**
- Commit message, lint gate, and PR → **nodejs-contributing**
- Documenting the new option in `doc/api/` → **nodejs-api-docs**
- How the subsystem you are editing works internally → **nodejs-runtime-internals**
