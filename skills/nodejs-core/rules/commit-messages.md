---
name: commit-messages
description: Node.js core commit style derived from 2024-2025 commits and current contribution rules
metadata:
  tags: commit-message, git, contributing, nodejs-core, dco
---

# Node.js Core Commit Messages

Use this style for commits intended for `nodejs/node`. It combines the current
project requirements with the dominant style in human-authored commits from
2024 and 2025.

## Default shape

```text
subsystem[,subsystem...]: imperative description

Optional explanation of the problem, previous behavior, and reason for the
change. Wrap prose at 72 columns.

Signed-off-by: Human Contributor <human@example.com>
```

Examples of common prefixes include `assert`, `build`, `crypto`, `deps`, `doc`,
`fs`, `http`, `lib`, `module`, `src`, `stream`, `test`, `test_runner`, and
`tools`. Use `git log --oneline -- files/you/changed` to find the established
subsystem. Join multiple necessary subsystems with commas and no spaces, for
example `lib,src,test,doc:`.

## Subject line

- Use `<subsystem>: <description>`, not Conventional Commits such as
  `fix(fs): ...`.
- Start the description with an imperative verb: `add`, `fix`, `remove`,
  `update`, `use`, `move`, `improve`, `make`, `support`, or another direct verb.
- Keep the subject lowercase except for proper nouns, acronyms, and exact code
  identifiers such as `URL`, `V8`, or `FileHandle`.
- Prefer 50 characters or fewer; never exceed 72 characters.
- Do not end the subject with punctuation.
- Describe one logical change. A logical change may include its implementation,
  tests, and documentation.
- Use Git's generated `Revert "..."` form only for an actual revert.

Good:

```text
fs: avoid closing file handles twice
module: preserve URL in createRequire()
lib,src,test: fix tests without SQLite
doc: clarify fileURLToPath security considerations
```

Avoid:

```text
fix(fs): Fixed a bug in the file system.
Update module behavior
test: adds comprehensive test coverage for the new implementation
```

## Tone and voice

Write like a maintainer recording an engineering decision for another
maintainer:

- Be direct, technical, and matter-of-fact.
- Prefer concrete behavior and exact identifiers over general descriptions.
- Use the imperative mood only in the subject. Use short declarative sentences
  in the body.
- Prefer an impersonal explanation (`Previously, ...`, `This caused ...`) over
  a first-person narrative about the work.
- State only effects, tests, and performance results supported by the change.
- Match terminology already used by the subsystem and its documentation.

Avoid promotional or ceremonial language: `comprehensive`, `robust`,
`seamless`, `enhance`, `leverage`, `This commit addresses ...`, and similar
filler. Do not thank reviewers, announce that the work is complete, or describe
the patch as a series of files and edits.

```text
Avoid: stream: enhance stream handling for improved robustness
Use:   stream: preserve errors from async iterators
```

## Body

Omit the body when the subject fully explains a small change. When context is
needed, use this order without adding headings:

1. State the previous behavior or problem.
2. State its observable consequence.
3. Explain why the chosen change is correct when that is not obvious.

Use one or two short paragraphs by default. Do not narrate the diff line by
line or add `Summary`, `Changes`, `Benefits`, or `Testing` headings to a routine
commit. Use bullets only when several independent facts are clearer as a list.
Wrap prose at 72 columns, except for unbreakable URLs and code.

For a breaking change, explain why it is necessary, what situation triggers
it, and the exact user-visible break.

```text
module: preserve URL in createRequire()

Previously, createRequire() discarded a URL passed to the mock parent module.
The URL is now preserved so module.registerHooks() observes the original value.

Signed-off-by: A. Contributor <contributor@example.com>
```

## DCO and landing metadata

Create human-authored commits with `git commit -s` so Git adds the contributor's
`Signed-off-by:` trailer. The sign-off certifies the Developer Certificate of
Origin and must contain the human contributor's name and email. Current Node.js
guidance exempts dependency updates (for example, cherry-picks), release
commits, backport commits, and bot-generated commits from this rule. When a
commit has multiple authors, add a sign-off for each author; at least one must
match the commit author metadata.

- The sign-off must use the contributor's own identity.
- Credit actual co-authors with correctly formatted trailers.
- Put `Fixes:` and `Refs:` lines, with full URLs, in the pull request
  description. The landing process adds them to the resulting commit.
- **Never add a `PR-URL:` trailer to a commit you author.** `PR-URL:` and
  `Reviewed-By:` are added at landing time by the commit queue or
  `git node land`, from the pull request and its approvals. You cannot know
  the PR number before opening the PR, and a hand-written or guessed value
  ends up wrong in the permanent history. This holds even when
  `core-validate-commit` reports a missing `PR-URL` — see below.

A landed commit commonly ends like this:

```text
Signed-off-by: A. Contributor <contributor@example.com>
PR-URL: https://github.com/nodejs/node/pull/12345
Fixes: https://github.com/nodejs/node/issues/12344
Reviewed-By: Reviewer Name <reviewer@example.com>
```

See [pull-request-descriptions.md](pull-request-descriptions.md) for `Fixes:`
and `Refs:` semantics in the authored PR body.

## Validate every commit in a `nodejs/node` checkout

**Validate each commit message with `core-validate-commit` before pushing.**
It is the same tool the project runs in CI, so a local run is what makes the
commit-lint job pass on the first attempt.

Do not run `core-validate-commit` against unrelated repositories, including the
skills repository containing this document — its subsystem rule is specific to
`nodejs/node`. In a `nodejs/node` checkout:

```bash
# Inspect the complete message.
git log -1 --format=%B

# Validate the commit you just authored.
npx core-validate-commit --no-validate-metadata HEAD

# Validate every commit on the branch.
git rev-list upstream/main..HEAD | xargs npx core-validate-commit --no-validate-metadata
```

**Always use `--no-validate-metadata` on authored commits.** Metadata
validation is on by default (`-V, --validate-metadata`) and enforces the
`PR-URL:` and `Reviewed-By:` trailers that exist only after landing. Without
the flag, a perfectly good local commit fails the `pr-url` and `reviewers`
rules. That output is expected — **do not "fix" it by adding a `PR-URL:`
trailer.** Node.js CI uses the same flag:

```bash
# From .github/workflows/commit-lint.yml
npx -q core-validate-commit --no-validate-metadata --tap <sha>
```

Note that CI validates only the first commit of a pull request; the branch-wide
command above covers the rest.

Validate *with* metadata only when inspecting a commit that has already landed
on `main`:

```bash
npx core-validate-commit HEAD   # landed commits only
```

Fix any failure with `git commit --amend` (or an interactive rebase for older
commits) while the branch is still local.

If the human sign-off is missing, amend with the contributor's configured
identity:

```bash
git commit --amend --signoff
```

## Evidence for the house style

The observed sample contains 4,617 human-authored commits in the `nodejs/node`
main history dated 2024-01-01 through 2025-12-31:

- 96.7% used a subsystem prefix.
- Of prefixed subjects, 98.1% began lowercase after the colon.
- 69.1% were at most 50 characters; all but two were at most 72.
- Only one subject ended in punctuation.
- 61.4% had no prose body beyond landing trailers.
- Bodies that existed had a median of 25 words; 98.9% of ordinary prose lines
  were at most 72 columns.
- Headings appeared in only 3 of 4,617 commit bodies.

Use these figures as a style signal, not as a substitute for the current
requirements.

## Upstream sources

- [Current contribution policy at the analyzed revision](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/CONTRIBUTING.md)
- [Commit message guidelines at the analyzed revision](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/pull-requests.md#commit-message-guidelines)
- [Supported subsystems](https://github.com/nodejs/core-validate-commit/blob/main/lib/rules/subsystem.js)
