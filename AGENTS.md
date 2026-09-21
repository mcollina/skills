This file provides guidance to AI coding agents like Claude Code (claude.ai/code), Cursor AI, Codex, Gemini CLI, GitHub Copilot, and other AI coding assistants when working with code in this repository.

## What this repository is

- This is a **skills/prompt library** for AI-assisted development (not a typical application service).
- Primary content lives under `skills/` as Markdown skill definitions and rule documents.
- `src/index.ts` is minimal and only exports `version`; it is not where product logic lives.

## High-level architecture

### 1) Skill packages (`skills/<skill-name>/`)

Each skill directory is a self-contained package of guidance:

- `SKILL.md`: entrypoint for the skill (metadata, when-to-use, instructions, links)
- `rules/*.md`: detailed rule documents referenced from `SKILL.md`

Current top-level skills include:

- `documentation`
- `fastify`
- `init`
- `linting-neostandard-eslint9`
- `node`
- `nodejs-addons`
- `nodejs-api-docs`
- `nodejs-build`
- `nodejs-contributing`
- `nodejs-native-debug`
- `nodejs-runtime-internals`
- `nodejs-source`
- `nodejs-v8-perf`
- `oauth`
- `octocat`
- `skill-optimizer`
- `snipgrapher`
- `typescript-magician`

### 2) Minimal TypeScript package surface (`src/`)

- `src/index.ts` exports package version only.
- TypeScript config (`tsconfig.json`) is strict and `noEmit`; this repo uses TS checks, not a compile output pipeline.

### 3) Documentation-driven behavior

- Most “logic” is instruction text in Markdown.
- Internal cross-references in `SKILL.md` files (for example `rules/...`) are part of the public skill structure and should stay valid.

## Common commands

Run from repository root.

- Install deps: `npm install`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Run tests: `npm test` (alias for `node --test`)
- Run a single test file: `node --test path/to/file.test.ts`
- Run tests matching a name: `node --test --test-name-pattern "pattern"`
- Check skill structure: `npm run skill:lint`
- Report skill context cost: `npm run skill:budget` (`--rules`, `--json`, `--check`)

## Context tiers

Skill content is loaded in three tiers with very different lifetimes, and the
tier a piece of text lands in matters more than its length.

| Tier | What | When it is paid |
| --- | --- | --- |
| resident | `SKILL.md` frontmatter | every request of every session, used or not |
| activation | `SKILL.md` body | whenever the skill fires, **including by mistake** |
| on-demand | `rules/*.md` | only when a rule is actually read |

Rule files are reported by `skill:budget` but not budgeted. Size does not
distinguish dense, project-specific reference from a restatement of training
data — the largest rule file in this repo is almost entirely non-guessable
detail, while generic style tutorials sat in a much smaller one. Read the
largest files; do not just shrink them.

Activation is the expensive tier: it is loaded early in a session and rarely
evicted, so it is multiplied by nearly every subsequent turn. Corpus size is
mostly noise by comparison — a large skill with a small router is cheaper in
practice than a small skill with a large one.

Consequences for editing:

- **A skill is the smallest unit a single task needs in full.** If activating
  it loads material the task will not use, the boundary is drawn too high.
  `npm run skill:budget` flags routers over ~1000 tokens; that is nearly always
  a skill covering more than one task.
- **Duplicate invariants freely; never duplicate reference material.** A
  three-line non-negotiable repeated across two skills costs ~40 tokens and
  prevents silent behavioural regressions. A duplicated 12 KB explainer does
  not.
- **Prefer a script to a described procedure.** An exact command sequence with
  a subtle failure mode belongs in `scripts/`, where it costs a few tokens to
  invoke and cannot be half-remembered (see
  `skills/nodejs-contributing/scripts/precommit-gate.sh`).
- **Write the delta, not the tutorial.** The valuable content is what the model
  cannot guess — project-specific flags, traps, and conventions — not general
  background it already has.
- **Do not restate routing in the body.** The frontmatter `description` decides
  whether a skill fires. A "When to use" list in the body repeats that decision
  after it has been made, so it costs activation tokens on every fire and
  changes nothing. Put trigger signals in the description instead. Enforced by
  `npm test`.
- **Never name a file that does not exist.** An agent told to read a missing
  file will either fail or invent its contents. Reference rule files as real
  links so `npm run skill:lint` can verify them.

## Editing rules for this repo

1. Treat `skills/*/SKILL.md` as an index contract.
   - Every `rules/*.md` file must be explicitly mentioned and linked from that skill’s main `SKILL.md`.
   - If you add/rename/remove any `rules/*.md`, update the corresponding links in `SKILL.md` in the same change.
   - Enforced by `npm run skill:lint`.

2. Preserve skill metadata/frontmatter format.
   - Skill and rule docs use YAML frontmatter (`name`, `description`, `metadata.tags`).
   - A skill's `tile.json` must register it under exactly the `name` its `SKILL.md` declares.

3. Keep naming consistent with existing directory structure.
   - Add new guidance under an existing skill’s `rules/` unless you are intentionally creating a new skill.

4. Reference other skills by name, never by relative path.
   - Skills install independently, so `../../other-skill/rules/x.md` does not resolve at runtime.
   - Write ``see `x.md` in the **other-skill** skill`` instead. Enforced by `npm run skill:lint`.

5. Validate changes with project scripts.
   - At minimum run `npm run typecheck`, `npm test`, and `npm run skill:lint` after substantial edits.
   - Editing any `SKILL.md` or `rules/*.md` also triggers the benchmark gate in
     [docs/skill-benchmarking.md](docs/skill-benchmarking.md).

## Existing agent/tooling constraints found in repo

- `.claude/settings.local.json` allows `npx githuman:*` commands for Claude-specific workflows.
- `.githuman/` is intentionally gitignored project tooling state.
