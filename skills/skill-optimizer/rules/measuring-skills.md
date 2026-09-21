---
name: measuring-skills
description: Tooling for measuring skill context cost and structure, which properties are mechanically checkable, and two that are not
metadata:
  tags: measurement, tooling, linting, budgets, metrics, false-positives
---

# Measuring skills

## The tools

```bash
npm run skill:budget            # context cost by tier, per skill
npm run skill:budget -- --rules # break down each skill's rule files
npm run skill:budget -- --check # exit non-zero on a budget breach
npm run skill:lint              # structural contracts
```

`skill:budget` reports resident, activation, and on-demand cost per skill (see
[context-budget.md](context-budget.md) for what those mean) and enforces the
resident and activation budgets.

`skill:lint` enforces what can be checked exactly:

- every rule file is linked from its `SKILL.md`, and every link resolves
- frontmatter `name` matches the directory
- `tile.json` agrees with `SKILL.md`
- no relative path into a sibling skill — skills install independently, so
  those paths do not resolve at runtime; reference other skills by name
- every prose mention of a `rules/...` path exists

## Write the delta, not the tutorial

The value of a skill is what the model cannot already produce: project
conventions, non-obvious flags, traps, exact thresholds, house idioms. General
background is already in the weights, and restating it displaces the delta.

Content that is nearly always waste:

- capability lists ("this skill can handle generics, mapped types, ...") which
  duplicate the rules index
- language basics — `const` over `var`, prefer `unique_ptr`, use destructuring
- re-explaining a well-known tool's documented behaviour with no local twist

## Two things that cannot be measured this way

Recording these because both were tried, and both were removed.

### Size does not detect a tutorial

An obvious check is to flag rule files over some token threshold, on the theory
that long files are padded. In practice the largest file in a corpus was almost
entirely non-guessable project detail — exact column limits, which trailers are
written by tooling, house idioms — while generic `'use strict'`-and-`const`
style guidance sat in a much smaller file that passed comfortably.

The check flagged the best file and passed the worst one. Size correlates with
density at least as strongly as with padding, so it cannot separate them.
Report the largest files for a human to read; do not gate on them.

### Verbatim duplication does not detect redundancy

The second attempt was to flag text repeated between a `SKILL.md` and its own
rule files. It produces almost entirely false positives, because invariants are
*supposed* to be repeated: a router naming `--no-validate-metadata` and a rule
file explaining it is the intended pattern, not waste.

Meanwhile the real cases are semantic rather than literal — a rule stated in
prose and then restated as an annotated example, in different words. Simple
matching misses exactly those.

### The rule this gives

**A check that cannot distinguish good from bad is worse than no check.** It
produces warnings that must be ignored, and a corpus where warnings are
routinely ignored is one where real failures are invisible. Prefer an exact
check over a broad heuristic, even when the exact check covers less: make the
convention precise enough to verify, then verify it.

## The metric nobody collects

Activation is usually measured as "did the right skill fire?" The complement —
**how often does a skill fire on a task it cannot help with?** — is rarely
tracked and directly funds the context budget. A skill whose description
over-promises scores well on recall and quietly taxes every adjacent task.

When adding trigger terms to improve activation, check the misfire rate on
neighbouring scenarios in the same run.
