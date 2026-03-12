# Skill benchmark runs

This file stores historical benchmark snapshots for this repository.

Add new entries at the top using the template from [`docs/skill-benchmarking.md`](./skill-benchmarking.md).

---

## 2026-03-12 — targeted activation/regression spot-checks

Method: lightweight cross-model checks using `subagent` with `anthropic/claude-haiku-4-5`, `anthropic/claude-sonnet-4-6`, and `anthropic/claude-opus-4-6`.

> Note: This is a **quick directional eval**, not a full Tessl `review-model-performance` run.

### Scenario A — node-best-practices stream/ETL activation

Criteria scored per response (3 total):
1. Uses `pipeline(...)`.
2. Includes explicit `async function*` transform.
3. Uses explicit `lru-cache` or `async-cache-dedupe`.

| Model | Without guidance | With guidance | Delta |
|------|------------------|---------------|-------|
| haiku-4-5 | 33% (1/3) | 100% (3/3) | +67pp |
| sonnet-4-6 | 67% (2/3) | 100% (3/3) | +33pp |
| opus-4-6 | 33% (1/3) | 100% (3/3) | +67pp |

### Scenario B — nodejs-core commit footer handling

Criteria scored per response (3 total):
1. Node-style subsystem subject line.
2. `Fixes:` footer present when issue is closed.
3. `Refs:` footer present for related PR.

| Model | Without guidance | With guidance | Delta |
|------|------------------|---------------|-------|
| haiku-4-5 | 100% (3/3) | 100% (3/3) | +0pp |
| sonnet-4-6 | 67% (2/3) | 100% (3/3) | +33pp |
| opus-4-6 | 100% (3/3) | 100% (3/3) | +0pp |

### Regressions
- none observed in these spot-check scenarios.

### Universal failures (0% with guidance)
- none observed in these spot-check scenarios.
