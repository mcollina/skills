---
name: nodejs-api-docs
description: Edits the API reference under doc/api/ in the nodejs/node repository. Use when adding or changing doc/api/*.md, writing YAML changes metadata for added/deprecated APIs, ordering reference links, documenting a new error code, or adjusting code examples so they pass the documentation linters.
metadata:
  tags: nodejs-core, doc-api, api-reference, documentation-lint, yaml-metadata, error-codes, deprecations
---

## Scope

This is the `nodejs/node` API reference specifically — the files under
`doc/api/`, with their own YAML metadata, link conventions, and linters. For
general technical writing and the Diátaxis framework, use the **documentation**
skill instead.

## Non-negotiables

1. **Every API addition or change needs YAML `changes` metadata** with the
   version it landed in. The release tooling reads it; a missing entry means
   the change is invisible in the changelog.
2. **Code examples are linted.** `make lint-md` and `lint-addon-docs` run over
   `doc/api/`, so examples must be valid, runnable, and correctly fenced with a
   language tag.
3. **Reference links go at the bottom in sorted order.** The docs use
   reference-style links with a maintained, alphabetised block.

## Rules

- [rules/documentation.md](rules/documentation.md) — `doc/api/*.md` structure, link ordering, error docs, code example constraints

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Running `make lint-md` and the rest of the gate → **nodejs-contributing**
- The CLI flag being documented → **nodejs-source**
- General documentation craft and Diátaxis → **documentation**
