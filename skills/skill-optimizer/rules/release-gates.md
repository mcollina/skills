---
name: release-gates
description: Go/no-go checks for shipping skill updates safely
metadata:
  tags: release, quality-gates, governance, process
---

# Release gates for skill changes

## Structural gates (cheap, run first)

These are deterministic and take seconds, so clear them before spending a
benchmark run:

```bash
npm run skill:lint              # index contract, tile consistency, cross-skill refs
npm run skill:budget -- --check # resident and activation budgets
```

- No skill over its resident or activation budget
- No dangling rule links, no relative paths into a sibling skill
- Any new or renamed rule file is linked from its `SKILL.md`

## Required pass conditions

- No universal 0% criteria with skill enabled
- No negative delta on critical scenarios
- Benchmark run recorded with date, matrix, and deltas
- Follow-up issues opened for unresolved failures/regressions

## Soft pass conditions

- At least one measurable gain on a target weak model
- No significant context-size increase without measured benefit
- No increase in misfire rate on neighbouring scenarios when trigger terms
  were added

## PR checklist

- [ ] `skill:lint` and `skill:budget -- --check` clean
- [ ] Updated `SKILL.md` links for any new/renamed rule file
- [ ] Any content moved between tiers re-benchmarked, not assumed equivalent
- [ ] Added/updated benchmark run log entry
- [ ] Included validation command outputs (`test`, `typecheck`, `lint`)
- [ ] Linked tracking issues and remediation notes

## Post-merge loop

- schedule rerun after next model update
- compare against prior run history
- prune stale guidance that no longer moves metrics
