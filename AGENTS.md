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
- `node`
- `nodejs-core`
- `oauth`
- `octocat`
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

## Editing rules for this repo

1. Treat `skills/*/SKILL.md` as an index contract.
   - If you add/rename/remove any `rules/*.md`, update the corresponding links in `SKILL.md`.

2. Preserve skill metadata/frontmatter format.
   - Skill and rule docs use YAML frontmatter (`name`, `description`, `metadata.tags`).

3. Keep naming consistent with existing directory structure.
   - Add new guidance under an existing skill’s `rules/` unless you are intentionally creating a new skill.

4. Validate changes with project scripts.
   - At minimum run `npm run typecheck` and `npm test` after substantial edits.

## Existing agent/tooling constraints found in repo

- `.claude/settings.local.json` allows `npx githuman:*` commands for Claude-specific workflows.
- `.githuman/` is intentionally gitignored project tooling state.
