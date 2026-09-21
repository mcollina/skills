# Skill benchmark runs

This file stores historical benchmark snapshots for this repository.

Add new entries at the top using the template from [`docs/skill-benchmarking.md`](./skill-benchmarking.md).

---

## PENDING — `nodejs-core` split into eight task-scoped skills

`nodejs-core` was replaced by `nodejs-contributing`, `nodejs-build`,
`nodejs-source`, `nodejs-addons`, `nodejs-native-debug`, `nodejs-v8-perf`,
`nodejs-runtime-internals`, and `nodejs-api-docs`. No rule content was rewritten;
the 28 `rules/*.md` files moved unchanged.

**This invalidates the Scenario B baseline below** — that scenario measured the
`nodejs-core` router, which no longer exists. The equivalent scenario now
targets `nodejs-contributing`.

Per the release gate in [`docs/skill-benchmarking.md`](./skill-benchmarking.md),
this change is **not ready to ship** until re-run across haiku/sonnet/opus. The
two risks specific to a split are:

1. **Activation regression.** One large router matched a wide range of prompts.
   Eight narrow ones can each fail to fire, so a task that previously got
   guidance now gets none. Scenario B is the direct check: does
   `nodejs-contributing` fire on a bare "write a commit message for this fix"?
2. **Lost invariants at the seams.** The `-s` sign-off, the
   `--no-validate-metadata` flag, the never-write-`PR-URL` rule, and the
   rebuild-after-`lib/`-change rule were promoted into `nodejs-core/SKILL.md` by
   #38 and #39 *in response to observed failures*. They now live in
   `nodejs-contributing` and `nodejs-build`. Re-run the scenarios that motivated
   those commits before trusting the split.

Context cost, for reference (estimated tokens):

| | resident | activation on the commit-message path |
| --- | --- | --- |
| before (`nodejs-core`) | 155 | 2861 |
| after (`nodejs-contributing`) | 119 | 858 |

Resident cost across all eight is 965, up 810 from the single skill; activation
on a given task path falls by 70–89%.

---

## 2026-03-12 — targeted activation/regression spot-checks

Method: lightweight cross-model checks using `subagent` with `anthropic/claude-haiku-4-5`, `anthropic/claude-sonnet-4-6`, and `anthropic/claude-opus-4-6`.

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
