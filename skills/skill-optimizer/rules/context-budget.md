---
name: context-budget
description: The three-tier cost model for skills — what each tier costs, what belongs in it, and how to split a skill that has outgrown its router
metadata:
  tags: context, tokens, compression, relevance, tiers, activation-cost, splitting
---

# Context budget

## The cost model

Skill content is paid for in three different ways. Deciding what belongs where
is the whole of context budgeting; everything else follows from it.

| Tier | What | When it is paid |
| --- | --- | --- |
| **Resident** | frontmatter `description` | every request, for every installed skill, used or not |
| **Activation** | the `SKILL.md` body | every request from the turn the skill fires onward |
| **On-demand** | `rules/*.md` | every request from the turn a rule is actually read |

The multipliers differ, and that is what matters:

- **Resident scales with the number of skills.** Thirty skills with 200-token
  descriptions is 6000 tokens in front of every request, before the user has
  said anything. Per-skill descriptions must be tiny.
- **Activation scales with conversation length.** A skill that fires on turn 2
  of a twenty-turn session pays its body eighteen more times. This is why a
  fat router is the most expensive mistake available.
- **On-demand is paid once, late, and only when needed.** A 4000-token
  reference file read on the one turn that needs it is *cheaper* than 400
  tokens of the same material sitting in a router that fires constantly.

The counter-intuitive consequence: **total corpus size is nearly irrelevant.**
Optimise the router, not the repository.

## Budgets

| Tier | Budget | On breach |
| --- | --- | --- |
| resident | 200 tokens | tighten the description; drop internal-method prose that names no trigger |
| activation | 1000 tokens | the skill covers more than one task — split it |
| rule file | none | reported, not enforced; see [measuring-skills.md](measuring-skills.md) |

## Activation unit = task unit

**A skill is the smallest unit a single task needs in full.**

If activating a skill loads material the current task will never use, the
boundary was drawn too high. An activation cost over ~1000 tokens is the
reliable tell: nothing a *single* task needs as non-negotiable context runs
that long.

Worked example: a `nodejs-core` skill with 28 rule files and a 2861-token
router covered addon authoring, V8 tuning, the build system, API docs, and
PR review. Any one task used a fraction of it and paid for all of it. Split
into eight task-scoped skills, routers landed at 119–628 tokens, and a task
that needs the build system no longer pays for N-API guidance.

Symptoms that a skill is really several:

- the router is a table of contents for unrelated domains
- the description has to enumerate many disjoint trigger clusters
- two sections have no task that needs both

## Invariants versus reference

This is the decision for every line in a `SKILL.md`.

**Invariants** — non-negotiables, decision rules, safety and security checks.
Short, imperative, and load-bearing on every use of the skill. These are
*supposed* to be in the router, and may be repeated across skills.

**Reference** — procedures, worked examples, tutorials, explanation, option
tables. Needed at some point by some task, not by all of them. These belong in
`rules/`.

Two rules follow:

- **Duplicate invariants freely.** The same non-negotiable in three skills is
  correct: each must stand alone, and the cost is a line.
- **Never duplicate reference.** One owner per procedure; everything else
  links to it by name. Reference stated twice will drift, and the reader
  cannot tell which copy is current.

The common failure is a router that states a rule in prose and then restates
it as an annotated example directly below. Both cost activation tokens on
every fire; one of them is redundant.

## Do not restate routing in the body

The `description` decides whether a skill fires. A "When to use" or
"Activation examples" section in the body repeats that decision *after* it has
been made, so it is paid on every activation and changes nothing. Put trigger
signals in the description, where they do the routing work. See
[activation-design.md](activation-design.md) for the tier assignment.

## Turn procedures into scripts

An exact, ordered sequence — a pre-commit gate, a release check, a validation
run — does not belong in prose at all. A script is executed rather than read:
it costs a single command in context, cannot be half-followed, and can guard
its own preconditions. Replacing 600 tokens of procedure with
`bash scripts/precommit-gate.sh` is both cheaper and stricter.

Keep prose for judgement. Move determinism into code.

## Compression, in priority order

Keep:

- decision tables and short checklists
- non-negotiables, in imperative form
- one integrated example per high-value scenario

Cut:

- capability lists that restate the rules index
- background the model already has (see "delta, not tutorial" in
  [measuring-skills.md](measuring-skills.md))
- a second example teaching the same lesson as the first
- rationale for a rule nobody disputes

Only promote detail into `SKILL.md` when a benchmark shows it is being missed
where it currently lives — and record that reason, so a later reader does not
"tidy it away" as redundant.
