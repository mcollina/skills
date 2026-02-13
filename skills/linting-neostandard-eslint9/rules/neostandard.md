---
name: neostandard
description: How neostandard actually works with ESLint v9 flat config
metadata:
  tags: neostandard, eslint, eslint9, flat-config, standardjs, typescript
---

`neostandard` is a **shared ESLint flat config** and config generator, not a standalone replacement linter command.

## Key model

- You install **both** `neostandard` and `eslint`
- You generate or author `eslint.config.js` / `eslint.config.mjs`
- You run linting via `eslint` (`eslint .`, `eslint . --fix`)

## Install

```bash
npm install --save-dev neostandard eslint
```

## Create config

Generate ESM config:

```bash
npx neostandard --esm > eslint.config.js
```

Generate CommonJS config:

```bash
npx neostandard > eslint.config.js
```

Or author manually (ESM):

```js
import neostandard from 'neostandard'

export default neostandard({
  ts: true
})
```

## Run lint

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

## Common options

- `ts: true` — lint `*.ts` and `*.d.ts`
- `semi: true` — semicolon mode (semistandard-style)
- `noStyle: true` — disable style rules (useful with Prettier/dprint)
- `noJsx: true` — disable JSX rules
- `ignores`, `files`, `filesTs`, `env`, `globals`

## Version caveat (v1+)

As of neostandard v1+, `eslint-plugin-import-x` is no longer bundled.

- If you need deep import/export lint rules, add `eslint-plugin-import-x` explicitly
- For many TypeScript projects, prefer `tsc --noEmit` for module/import correctness checks

## Useful export

Use `.gitignore` patterns as ESLint ignores:

```js
import neostandard, { resolveIgnoresFromGitignore } from 'neostandard'

export default neostandard({
  ignores: resolveIgnoresFromGitignore()
})
```

## Important migration note

For projects moving from `standard`, keep `neostandard` as the config source but run lint through `eslint`.
