# Skill benchmarking workflow (cross-model)

Use this workflow to catch two failure modes before shipping skill changes:

1. **Non-activation**: criteria that stay at 0% with the skill enabled.
2. **Regression**: score decreases with skill enabled vs baseline.

## When to run

Run benchmarks when:
- editing any `skills/*/SKILL.md`
- editing any `skills/*/rules/*.md`
- preparing a release of updated skills

## Baseline matrix

For each scenario, run:
- `claude-haiku-4-5` (without skill, with skill)
- `claude-sonnet-4-6` (without skill, with skill)
- `claude-opus-4-6` (without skill, with skill)

Record:
- overall score delta per model
- per-scenario deltas
- per-criterion pass/fail

## Recommended workflow (Tessl)

Install tooling:

```bash
curl -fsSL https://get.tessl.io | sh
```

Install benchmark skill:

```bash
tessl i tessl-labs/review-model-performance
```

Then, from your agent session:

```text
Use review-model-performance to evaluate <skill-name>.
```

## Release gate

A change is **not ready** if any of these are true:

- Any criterion is **0% across all three models with skill enabled**.
- Any critical scenario has a **negative delta** with skill enabled.
- Any model shows a repeatable regression that is unexplained.

A change is **ready** when:

- no universal 0% criteria remain, and
- no skill-enabled regressions remain in critical scenarios.

## Follow-up issue policy

Open an issue immediately for each:
- universal criterion failure (0% across all models)
- regression scenario (negative delta)

Include in each issue:
- model + scenario + criterion
- without-skill score, with-skill score, delta
- suspected cause in skill text
- proposed fix and rerun plan

Store completed runs in [`docs/skill-benchmark-runs.md`](./skill-benchmark-runs.md).

## Run log template

```md
### <date> — <skill>

| Model | Without | With | Delta |
|------|---------|------|-------|
| haiku-4-5 |  |  |  |
| sonnet-4-6 |  |  |  |
| opus-4-6 |  |  |  |

#### Regressions
- scenario: ...
- criterion: ...
- delta: ...
- issue: ...

#### Universal failures (0% with skill)
- criterion: ...
- issue: ...
```
