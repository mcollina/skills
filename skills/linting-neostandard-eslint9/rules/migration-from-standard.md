---
name: migration-from-standard
description: Accurate migration path from standard to neostandard on ESLint v9
metadata:
  tags: standard, neostandard, eslint, eslint9, migration, flat-config
---

Use this when a project currently runs `standard` and you want modern ESLint v9 + flat config while keeping a Standard-like baseline.

## Canonical migration flow

1. Install dependencies:

```bash
npm install --save-dev neostandard eslint
```

2. (Optional preflight) verify helper command works:

```bash
npx neostandard --help
```

3. Generate migrated config from existing `package.json` `"standard"` settings:

```bash
npx neostandard --migrate > eslint.config.js
```

4. Replace lint scripts/CI commands from `standard` to `eslint`:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

5. Cleanup old setup:

```bash
npm uninstall standard
```

Then remove obsolete top-level `"standard"` config and editor integrations specific to `standard` (for example `vscode-standard`).

## Semicolon and TypeScript variants

- semistandard-like migration:

```bash
npx neostandard --semi --migrate > eslint.config.js
```

- TypeScript support in resulting config: set `ts: true` (or regenerate/configure accordingly).

## Behavioral differences to expect

- neostandard is built for ESLint 9 flat config (no `standard-engine` wrapper)
- rule implementation uses modern flat-config/plugin model
- some rules differ from legacy standard/`eslint-config-standard` behavior
- on neostandard v1+, import rules from `eslint-plugin-import-x` are not bundled by default

If you relied heavily on import linting in your old setup, either:
- add `eslint-plugin-import-x` explicitly, or
- rely on `tsc --noEmit` (recommended for TypeScript-heavy projects)

Run lint and fix incrementally after migration; keep tooling migration separate from rule-tuning commits.
