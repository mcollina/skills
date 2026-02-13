---
name: migration-from-legacy-eslint
description: Safe migration plan from legacy ESLint rc config to ESLint v9 flat config
metadata:
  tags: eslint, eslint9, migration, flat-config
---

Use this checklist to migrate with low risk.

## Migration checklist

1. Upgrade ESLint major version:
   ```bash
   npm install --save-dev eslint@^9
   ```
2. Create `eslint.config.js` or `eslint.config.mjs`
3. Translate legacy `extends`, `plugins`, and `overrides` into flat-config entries
4. Remove `.eslintrc*` and deprecated ignore files once parity is verified
5. Run lint and compare issue count before/after migration
6. Fix rule parity gaps explicitly in config
7. Update CI scripts to call `eslint .`

## Pitfalls to avoid

- Mixing legacy and flat config in the same project
- Forgetting to disable base rules when TS variants are enabled
- Assuming plugin presets are flat-config compatible without checking docs
- Migrating config and rule semantics in a single large change without validation
