---
name: nodejs-contributing
description: Writes and reviews nodejs/node commits and pull requests. Use when drafting a commit message for Node.js core, writing a PR description, validating a commit with core-validate-commit, running the pre-commit lint gate, or reviewing someone else's nodejs/node pull request.
metadata:
  tags: nodejs-core, contributing, commit-message, pull-request, code-review, dco, sign-off, core-validate-commit, lint
---

## Non-negotiables

These fail CI or block landing every time. They are not style preferences.

1. **Commit with `git commit -s`.** The `Signed-off-by:` trailer certifies the
   DCO. Without it `core-validate-commit` fails and the change cannot land. It
   must be the human contributor's name and email — never a tool or AI
   identity. Recover with `git commit --amend --signoff`.
2. **Never write `PR-URL:` or `Reviewed-By:` yourself.** The landing process
   adds them. A hand-written one is wrong and ends up in permanent history.
   Put `Fixes:` and `Refs:` in the **PR body**, not the commit.
3. **Always validate with `--no-validate-metadata`.** Bare
   `npx core-validate-commit HEAD` enforces trailers that only exist after
   landing, so it reports `pr-url`/`reviewers` failures that are expected and
   must not be "fixed".
4. **`make lint` before every commit.** `make test` runs no linters on Unix, so
   a green test run says nothing about the `Linters` CI job.
5. **For C++ changes, format from the merge base.** Bare `make format-cpp`
   defaults to `CLANG_FORMAT_START=HEAD` and only formats *staged* changes;
   CI formats from the merge base. Code committed earlier in the branch passes
   locally and fails in CI.
6. **Disclose AI assistance with `Assisted-by:`**, and never sign off or
   co-author as an agent.

Never skip a step because the change looks trivial, and never commit with
"will fix lint in a follow-up".

## The gate

Run the whole gate with the bundled script from inside a `nodejs/node`
checkout, after building:

```bash
bash scripts/precommit-gate.sh          # validate HEAD before pushing
bash scripts/precommit-gate.sh --staged # check working tree before committing
```

It runs the same checks CI does, in CI's form — including the merge-base
`format-cpp` invocation that is easy to get wrong by hand. Use
[rules/pre-commit-lint.md](rules/pre-commit-lint.md) when a check fails and you
need the CI-job-to-command mapping or the Python/shell/YAML targets that
`make lint` skips.

## Commit and PR style

Terse, subsystem-prefixed titles. Plain, matter-of-fact prose. Lead with
concrete behavior, then the reason for the change. Omit hype, canned headings,
file-by-file narration, and unsupported claims.

Read [rules/commit-and-pr-guideline.md](rules/commit-and-pr-guideline.md)
before drafting — it has the body decision rule, trailer order, and the
title-format rules `core-validate-commit` enforces.

## Rules

- [rules/commit-and-pr-guideline.md](rules/commit-and-pr-guideline.md) — commit message and PR description style, body decision rule, trailers, DCO
- [rules/pre-commit-lint.md](rules/pre-commit-lint.md) — the full lint/format/validate gate and the CI job it maps to
- [rules/contributing.md](rules/contributing.md) — the contribution process end to end
- [rules/reviewing-prs.md](rules/reviewing-prs.md) — reviewing for correctness, clarity, and project convention

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Building and testing before you commit → **nodejs-build**
- Primordials and other `lib/` constraints you are reviewing for → **nodejs-source**
- Editing `doc/api/*.md` as part of the change → **nodejs-api-docs**
