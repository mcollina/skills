---
name: skill-optimizer
description: "Optimizes AI skills for activation, clarity, and cross-model reliability. Use when creating or editing skill packs, diagnosing weak skill uptake, reducing regressions, tuning instruction salience, improving examples, shrinking context cost, or setting benchmark/release gates for skills. Trigger terms: skill optimization, activation gap, benchmark skill, with/without skill delta, regression, context budget, prompt salience."
metadata:
  tags: skills, optimization, benchmarking, activation, regressions, prompt-engineering
---


## Optimization loop (default workflow)

1. **Measure baseline and skill-on behavior** (per model, per scenario, per criterion)
2. **Find failure pattern**:
   - universal failure (0% with skill)
   - model-specific weakness
   - regression (negative delta)
3. **Edit for salience**:
   - add explicit triggers
   - add concrete integrated examples
   - tighten checklists and decision rules
4. **Re-run evals** and compare deltas
5. **Ship with guardrails** (documented gate + run history + follow-up issues)

## How to use

Read individual rule files for detailed procedures and templates:

- [rules/context-budget.md](rules/context-budget.md) - The three-tier cost model; what belongs in each tier and when to split a skill
- [rules/activation-design.md](rules/activation-design.md) - Improve retrieval and instruction uptake
- [rules/benchmark-loop.md](rules/benchmark-loop.md) - End-to-end benchmark loop and scoring
- [rules/measuring-skills.md](rules/measuring-skills.md) - Budget and lint tooling, and the properties that resist measurement
- [rules/regression-triage.md](rules/regression-triage.md) - Diagnose and fix skill-on regressions
- [rules/release-gates.md](rules/release-gates.md) - Go/no-go criteria before shipping skill updates

## Practical heuristics

- **Triggers go in the `description`; non-negotiables go in the body.** The
  description routes, so a "When to use" list in the body is paid on every
  activation after the decision it describes has already been made.
- **A skill is the smallest unit one task needs in full.** An activation cost
  over ~1000 tokens means it covers more than one task.
- **Duplicate invariants freely; never duplicate reference.** One owner per
  procedure, linked by skill name.
- **Write the delta, not the tutorial** — what the model cannot already produce
- Prefer **few high-signal rules** over many soft recommendations
- Include at least one **integrated example** per common scenario
- Track gains/losses with **with-skill vs without-skill** comparisons
