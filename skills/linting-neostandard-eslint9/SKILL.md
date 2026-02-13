---
name: linting-neostandard-eslint9
description: Linting workflows with neostandard and ESLint v9 flat config
metadata:
  tags: linting, neostandard, eslint, eslint9, flat-config, javascript, typescript
---

## When to use

Use this skill when you need to:
- Set up linting in a JavaScript or TypeScript project
- Use `neostandard` as a Standard-like ESLint v9 flat-config baseline
- Configure `eslint@9` with the flat config system (`eslint.config.js`/`eslint.config.mjs`)
- Migrate from `standard` to `neostandard` or ESLint v9
- Migrate from legacy `.eslintrc*` configuration to ESLint v9
- Run linting consistently in CI and local development

## How to use

Read individual rule files for implementation details and examples:

- [rules/neostandard.md](rules/neostandard.md) - Install, configure, and extend neostandard with ESLint
- [rules/eslint-v9-flat-config.md](rules/eslint-v9-flat-config.md) - Build ESLint v9 flat config for JS/TS projects
- [rules/migration-from-standard.md](rules/migration-from-standard.md) - Migrate from `standard` to `neostandard` or ESLint v9
- [rules/migration-from-legacy-eslint.md](rules/migration-from-legacy-eslint.md) - Migrate from `.eslintrc*` to flat config safely
- [rules/ci-and-editor-integration.md](rules/ci-and-editor-integration.md) - CI scripts, pre-commit, and editor setup

## Core principles

- Prefer reproducible linting with pinned major versions
- Keep config minimal and explicit
- Use flat config for ESLint v9 projects
- Treat lint failures as quality gates in CI
- Enable auto-fix for local workflows, but validate with non-fix CI runs
