---
name: init
description: Creates and prunes a repository's AGENTS.md, keeping only high-signal instructions an agent cannot infer from the code itself. Use when setting up agent instructions for a repository, when an existing AGENTS.md is long, generic, or stale, when agents repeatedly make the same avoidable mistake, or when workflows have changed and the guidance needs pruning.
metadata:
  tags: initialization, agents, context-engineering, agents-md, maintenance
---


## Instructions

Treat `AGENTS.md` as a **living list of non-discoverable landmines and workflow gotchas**, not a codebase overview.

### Core rule: discoverability filter

Before adding any line, ask:

> Can an agent discover this by reading the repo (`README`, code, config, scripts, directory tree)?

- If **yes**: do **not** include it in `AGENTS.md`.
- If **no**, and it materially affects task success/cost/safety: include it.

### What earns a line

Include only guidance that is:
1. **Non-discoverable** from repository files alone
2. **Operationally significant** (changes commands, outcomes, or safety)
3. **Actionable** (specific enough to execute)

Typical examples:
- Non-standard tooling choices (e.g. use `uv` instead of `pip`)
- Command caveats (e.g. tests must run with `--no-cache` due to fixture behavior)
- Hidden constraints/landmines (deprecated directories still imported in production)
- Critical local conventions that are not encoded in lint/tests/config

### What to remove or avoid

Do **not** include:
- Tech stack summaries
- Directory structure overviews
- Architecture descriptions agents can infer from code
- Generic best-practice advice
- Rules already enforced by tooling (linters, typecheck, tests, CI)
- Mandatory boilerplate headers unless the repo explicitly requires one

### Recommended structure

Prefer short, high-signal sections such as:
- `Scope & routing` (which areas need separate/module-local AGENTS files)
- `Non-discoverable commands`
- `Landmines / do-not-touch areas`
- `Task-specific constraints`

For large repos, recommend **hierarchical AGENTS.md** files near relevant modules instead of one monolithic root file.

### Source files to check first

- Existing `AGENTS.md`
- `README.md`
- `PROJECT.md` (if present)
- Cursor rules (`.cursor/rules/` or `.cursorrules`)
- Copilot instructions (`.github/copilot-instructions.md`)
- `GEMINI.md`
- CI/workflow files and package manager config (for command/tooling mismatches)

If `AGENTS.md` exists, improve it incrementally instead of replacing it blindly.

### Maintenance mindset

`AGENTS.md` is temporary guidance, not permanent configuration.

When recurring issues appear:
1. Prefer fixing the root cause in code/tooling (lint rule, test, script, structure)
2. Keep only the minimum instruction needed until the root cause is solved
3. Prune stale instructions aggressively

### Quality gate before finalizing

For each line in `AGENTS.md`, verify:
- Is it non-discoverable?
- Is it still accurate today?
- Does it materially reduce mistakes/cost/time?

Delete any line that fails one of these checks.
