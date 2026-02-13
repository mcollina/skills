---
name: ci-and-editor-integration
description: Integrate neostandard and ESLint v9 with CI pipelines, pre-commit hooks, and editors
metadata:
  tags: ci, linting, neostandard, eslint, pre-commit, vscode
---

## CI guidance

- Run lint in CI as a required step:

```bash
npm run lint
```

- Do not use auto-fix in CI.
- Keep CI Node.js version aligned with local development and project engines.

## Pre-commit hook pattern

Use `lint-staged` (or equivalent) to lint only changed files before commit.

```json
{
  "lint-staged": {
    "*.{js,mjs,cjs,ts,mts,cts}": [
      "eslint --fix"
    ]
  }
}
```

When using `neostandard`, keep pre-commit execution on `eslint --fix` because ESLint is the actual runner.

## VS Code integration

- Install ESLint extension
- Enable flat config support if required by extension version
- Use `editor.codeActionsOnSave` for explicit, predictable auto-fixes

Example workspace settings:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.validate": ["javascript", "typescript"]
}
```
