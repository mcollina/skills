---
name: eslint-v9-flat-config
description: Configure ESLint 9 flat config, with neostandard as the preferred baseline
metadata:
  tags: eslint, eslint9, flat-config, neostandard, javascript, typescript
---

ESLint v9 uses flat config by default. Prefer `eslint.config.js` or `eslint.config.mjs` over legacy `.eslintrc*` files.

## Preferred setup in this skill: neostandard baseline

Install:

```bash
npm install --save-dev eslint neostandard
```

Create config (ESM helper):

```bash
npx neostandard --esm > eslint.config.js
```

Run lint:

```bash
npx eslint .
```

## Manual flat config (when not using neostandard)

Install (example):

```bash
npm install --save-dev eslint @eslint/js typescript-eslint
```

Basic `eslint.config.mjs` (JS + TS):

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
]
```

## Package scripts

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

## Good practices

- Use a single root flat config unless package-level variance is required
- Keep TypeScript-aware rules scoped to TS files
- Avoid duplicate JS/TS rules; disable base rule when TS extension rule is used
- Keep CI on non-fix lint runs; reserve `--fix` for local workflows
