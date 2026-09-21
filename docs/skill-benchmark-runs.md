# Skill benchmark runs

This file stores historical benchmark snapshots for this repository.

Add new entries at the top using the template from [`docs/skill-benchmarking.md`](./skill-benchmarking.md).

---

## PENDING — router slimming across the remaining nine skills

Applied the same tiering to every skill outside the `nodejs-*` set. No rule
content was rewritten; material moved from `SKILL.md` into new `rules/` files,
and body-level "When to use" blocks were removed where the description already
carried the same routing signals.

| skill | activation before | after | change |
| --- | --- | --- | --- |
| `oauth` | 1591 | 489 | walkthrough → `rules/`, 4 fabricated refs removed |
| `node` | 1423 | 980 | six rules were indexed twice; merged |
| `documentation` | 1242 | 617 | four Diátaxis modes → `rules/` |
| `octocat` | 1134 | 452 | PR + git sequences → `rules/`, signing rules de-duplicated |
| `typescript-magician` | 1030 | 883 | capability list duplicated the rules index |
| `fastify` | 777 | 686 | routing block removed |
| `init` | 762 | 688 | routing block removed |
| `linting-neostandard-eslint9` | 556 | 440 | routing block removed |
| `snipgrapher` | 555 | 483 | routing block removed |
| `skill-optimizer` | 463 | 378 | routing block removed |

**Re-benchmark before shipping.** Two specific risks:

1. **Scenario A is directly affected.** It measures `node`'s streams/ETL
   checklist, which moved position within `SKILL.md` and whose description was
   rewritten. The checklist's four criteria were preserved verbatim in
   substance, and CSV/ETL trigger terms were *added* to the description, but
   the 33%/67%/33% → 100% result must be reproduced.
2. **Removing body-level "When to use" blocks is the one change that contradicts
   house doctrine.** `skill-optimizer/rules/activation-design.md` recommends
   listing task signals near the top of a skill. The argument for removal is
   that routing happens on the frontmatter description, so the body list is
   paid after the decision is made — but that depends on how the harness
   retrieves skills. If activation drops for any skill in the table above,
   this is the change to revert first.

Two pre-existing defects were fixed in passing: `oauth/SKILL.md` referenced four
files (`DEVICE_FLOW.md`, `TOKEN_VALIDATION.md`, `CLIENT_CREDENTIALS.md`,
`MOBILE_OAUTH.md`) that exist nowhere in the repository, and its description
claimed coverage of device and client-credentials flows that the skill does not
contain. Both would cause the model to improvise guidance under the skill's
authority.

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
