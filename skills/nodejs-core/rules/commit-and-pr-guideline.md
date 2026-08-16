---
name: commit-and-pr-guideline
description: Node.js core commit message and pull request description style, body decision rule, trailers, DCO sign-off, and validation
metadata:
  tags: commit-message, pull-request, description, contributing, nodejs-core, dco, core-validate-commit, style
---

# Writing Commits and Pull Requests for `nodejs/node`

Use this style for anything intended for `nodejs/node`. It combines the
current project requirements with the dominant style in human-authored
commits and pull requests.

**Write the commit message first.** The pull request description is normally
that same body plus the links a reviewer needs, and the PR title is the commit
subject verbatim. Getting the commit right gives you the PR almost for free.

## The short version

**Commit message**

```text
subsystem[,subsystem...]: imperative description under 50 characters

Optional body: what the previous behavior was, what went wrong because of
it, and why this change is the right fix. Wrap at 72 columns. Two short
paragraphs is already a long body.

Signed-off-by: Human Contributor <human@example.com>
```

**PR description** — the commit body, plus the links:

```text
Optional body: what the previous behavior was, what went wrong because of
it, and why this change is the right fix.

Fixes: https://github.com/nodejs/node/issues/12345
```

Delete the PR template's checklist and HTML comments. Node.js contributors do
not leave them in.

Never write `PR-URL:` or `Reviewed-By:` yourself — landing adds them.

## The subject line and PR title

The subject is the part with no stylistic variation across contributors. Get
it exactly right, and use the same string as the PR title — the commit queue
takes the PR title when it lands the change.

- Use `<subsystem>: <description>`, not Conventional Commits such as
  `fix(fs): ...`, and not a capitalized sentence.
- Start the description with a plain imperative verb. The common ones are
  `add`, `fix`, `update`, `move`, `remove`, and `use`.
- Keep it lowercase except for proper nouns, acronyms, and exact code
  identifiers such as `URL`, `V8`, or `FileHandle`.
- **Aim for 50 columns, never exceed 72.** `core-validate-commit` warns above
  50 and *fails* above 72. A `Revert "..."` subject gets 9 extra columns.
- Do not end it with punctuation.
- Describe one logical change. A logical change may include its
  implementation, tests, and documentation.
- Use Git's generated `Revert "..."` form only for an actual revert.

Find the subsystem with `git log --oneline -- path/you/changed`. Common
prefixes include `assert`, `build`, `crypto`, `deps`, `doc`, `fs`, `http`,
`lib`, `module`, `src`, `stream`, `test`, `test_runner`, and `tools`. Joining
multiple subsystems with commas and no spaces (`lib,src,test,doc:`) is correct
but uncommon — use it only when the change genuinely spans them.

Good:

```text
fs: do not crash if the watched file is removed while setting up watch
crypto: fix propagation of "memory limit exceeded"
lib: do not access process.noDeprecation at build time
src: update NODE_MODULE_VERSION to 131
lib,src,test: fix tests without SQLite
```

Avoid:

```text
fix(fs): Fixed a bug in the file system.
Update module behavior
test: adds comprehensive test coverage for the new implementation
```

## The body: write one when the subject does not carry the "why"

Body length is not a function of diff size — a one-line change can need three
sentences of rationale, and a large mechanical refactor often needs none. The
trigger is whether a reader can tell *why* from the subject alone.

Write a body when:

- The change fixes a bug whose cause is not obvious from the subject.
- The change is a behavior change users can observe.
- You made a non-obvious choice a reviewer might question.
- You are updating a dependency or ABI constant and the reason matters.
- The change is breaking: explain why it is necessary, what situation triggers
  it, and the exact user-visible break.

Skip it when the subject is already the whole story — a typo fix, a doc
wording change, a test moved to `node:test`, a flaky test marked.

### How to write it

Order, without adding headings:

1. State the previous behavior or problem.
2. State its observable consequence.
3. Explain why the chosen change is correct when that is not obvious.

- **Keep it short.** One or two short paragraphs. Past that, you are writing
  detail that belongs only in the PR description.
- **Wrap prose at 72 columns.** This is enforced: `core-validate-commit` fails
  on body lines over 72 columns. URLs and lines indented by four spaces
  (quoted upstream messages) are exempt; trailers may run to 120.
- Do not narrate the diff line by line or add `Summary`, `Changes`,
  `Benefits`, or `Testing` headings.
- Use bullets only when several independent facts are clearer as a list.
- Keep code fences out of commit bodies. Benchmark output and reproductions
  belong in the PR description.
- `Drive-by:` is the house idiom for a small unrelated cleanup carried along
  in the same commit.

Real examples, quoted verbatim from landed commits:

```text
lib: do not access process.noDeprecation at build time

Delay access at run time otherwise the value is captured at build
time and always false.
```

```text
test: fix `internet/test-inspector-help-page`

The webpage at the URL referenced by `node --inspect` was retitled when
it was recently moved.

Update the test to match the new title "Debugging Node.js" (formerly
"Debugging Guide").
```

```text
crypto: fix propagation of "memory limit exceeded"

When we throw ERR_CRYPTO_INVALID_SCRYPT_PARAMS after a call to
EVP_PBE_scrypt, check if OpenSSL reported an error and if so, append the
OpenSSL error message to the default generic error message. In
particular, this catches cases when `maxmem` is not sufficient, which
otherwise is difficult to identify because our documentation only
provides an approximation of the required `maxmem` value.
```

## Tone and voice

Write like a maintainer recording an engineering decision for another
maintainer:

- Be direct, technical, and matter-of-fact.
- Prefer concrete behavior and exact identifiers over general descriptions.
  Name the APIs, flags, errors, and subsystems involved.
- Use the imperative mood only in the subject. Use short declarative sentences
  in the body.
- Do not repeat the title in a longer sentence; start with the context the
  title is missing.
- Prefer an impersonal explanation (`Previously, ...`, `This caused ...`) over
  a first-person narrative about the work. Use first person only to record an
  actual decision or open question, such as `I kept this experimental
  because ...`.
- State uncertainty, limitations, and trade-offs plainly when they matter.
- State only effects, tests, and performance results supported by the change.
  Do not claim tests passed, performance improved, or compatibility was
  preserved without evidence.
- Match terminology already used by the subsystem and its documentation.

Opening with `This commit ...` is acceptable when a concrete verb follows
(`This commit moves the end of work check to finalize()`). It is filler in
`This commit addresses the issue where ...`; say what changed instead.

Avoid promotional or ceremonial language: `comprehensive`, `robust`,
`seamless`, `enhance`, `leverage`, `significantly improves`. Avoid canned
openings (`This PR aims to ...`) and closings (`This is now ready for
review`). Do not thank reviewers, announce that the work is complete, or
describe the patch as a series of files and edits.

```text
Avoid: stream: enhance stream handling for improved robustness
Use:   stream: preserve errors from async iterators
```

## Trailers

You write only `Signed-off-by:` and, when they apply, co-author trailers.
Everything else is added when the change lands.

| Trailer            | Who writes it | Where |
| ------------------ | ------------- | ----- |
| `Signed-off-by:`   | you, via `git commit -s` | commit |
| `Co-authored-by:`  | you, for real co-authors | commit |
| `Fixes:` / `Refs:` | you | **PR description** |
| `PR-URL:`          | landing tooling | commit (at landing) |
| `Reviewed-By:`     | landing tooling | commit (at landing) |

- **Never add a `PR-URL:` trailer to a commit you author.** `PR-URL:` and
  `Reviewed-By:` are added at landing time by the commit queue or
  `git node land`, from the pull request and its approvals. You cannot know
  the PR number before opening the PR, and a hand-written or guessed value
  ends up wrong in the permanent history. This holds even when
  `core-validate-commit` reports a missing `PR-URL` — see
  [Validate before you push](#validate-before-you-push).
- Do not add landing commit hashes, commit-queue logs, or backport metadata to
  the PR description either. Those belong to the landing workflow.

### DCO sign-off

Create human-authored commits with `git commit -s` so Git adds the
contributor's `Signed-off-by:` trailer. The sign-off certifies the Developer
Certificate of Origin and must contain the human contributor's name and email.

A missing sign-off is a hard failure of the `signed-off-by` rule, which skips
only release commits, `deps`-only commits, commits carrying a
`Backport-PR-URL:` trailer, and bot-authored commits; a commit mixing `deps`
with other subsystems is downgraded to a warning. When a commit has multiple
authors, add a sign-off for each author; at least one must match the commit
author's email, otherwise the rule warns.

A sign-off must name a human. The validator flags any sign-off whose name or
email looks like a bot or AI agent, so never sign off on a contributor's
behalf with a tool identity, and never fabricate another person's identity.

A landed commit commonly ends like this:

```text
Signed-off-by: A. Contributor <contributor@example.com>
PR-URL: https://github.com/nodejs/node/pull/12345
Fixes: https://github.com/nodejs/node/issues/12344
Reviewed-By: Reviewer Name <reviewer@example.com>
```

## The PR description

**The PR description is the commit body plus links.** Paste the commit body,
then add the references. Where a change needs no commit body, the PR
description often still carries context that helps a reviewer now but does not
belong in permanent history — CI observations, how you tested, what you tried
first.

- **Delete the template.** The `##### Checklist` block and the hidden HTML
  comments go. Never copy the Developer Certificate text into the visible
  body.
- **Keep it short.** Most descriptions are a sentence or two. A bare title
  with no description is acceptable only when it is genuinely
  self-explanatory.
- **Keep the title identical to the commit subject.**
- **Put `Fixes:` / `Refs:` at the bottom**, one per line, on standalone lines,
  with full URLs:
  - `Fixes: <issue-url>` when landing should close the issue.
  - `Refs: <issue-or-PR-url>` for relevant context that should not be closed.
  - Use both when both meanings apply; otherwise omit them.
- **No headings** on a routine PR — no `Summary`, `Changes`, `Benefits`, or
  `Test plan`. Do not repeat the file list, narrate each edit, or add a
  generic statement that tests pass.

Real examples, quoted verbatim:

```markdown
When a test is skipped, the corresponding beforeEach and afterEach hooks
should also be skipped.

Fixes: https://github.com/nodejs/node/issues/52112
```

```markdown
Reverts https://github.com/nodejs/node/pull/53063. There are still some
`filesystem::path` references left, since they're added in multiple
different PRs. Depending on whether we need them or not, we can remove them.

We're reverting because it fixes multiple different regressions due to
Windows UTF-16 path requirements.

Fixes https://github.com/nodejs/node/issues/54991
```

### What to add in the PR beyond the commit body

Add only what a reviewer needs and the commit should not carry:

- **Benchmark output for any performance claim.** Paste the
  `benchmark/compare.js` table, with the workload and enough runs to judge
  noise. A performance PR without numbers will be asked for numbers.
- **Reproductions, crash output, or the failing test.**
- **New or changed API:** observable behavior, limitations, and why it belongs
  in core. Include a focused example when it clarifies the contract.
- **Tests:** bug fixes and features must include tests. Mention testing in the
  description only when the validation is manual, platform-specific,
  non-obvious, or intentionally omitted.
- **What you deliberately did not do**, and open questions for reviewers —
  `I'm not sure if it is a good use of CI cycles to ...` is normal register.
- **`cc @nodejs/<team>`** to pull in a working group.
- **A short note when the PR is a revert or depends on another PR.**
- **Large PR:** follow Node.js's large-PR guide. The normal terse format is
  not a reason to omit required design and dependency detail.

A structured body is appropriate for a genuinely complex change:

```markdown
The new experimental API exposes the module compile cache to tooling. Tools can
enable caching without requiring an environment variable.

The API:

- uses NODE_COMPILE_CACHE when it is already set;
- falls back to a directory under os.tmpdir();
- can be disabled with NODE_DISABLE_COMPILE_CACHE.

On `<environment>`, `<benchmark command>` changed median startup time from
42.1 ms to 35.8 ms over 30 runs.

Refs: https://github.com/nodejs/node/issues/12345
```

### Prepare the PR command for the human contributor

Write the body to a file so Markdown and newlines are preserved. An AI tool
must not execute the final `gh pr create` command without the advance project
approval described in [ai-guidelines.md](ai-guidelines.md):

```bash
cat > /tmp/pr-body.md <<'EOF'
Concurrent close() calls could start more than one native close operation.
The closing state is now recorded before awaiting the first operation, so later
calls share its result.

Fixes: https://github.com/nodejs/node/issues/12345
EOF

gh pr create \
  --repo nodejs/node \
  --base main \
  --head USER:BRANCH \
  --title "fs: avoid closing file handles twice" \
  --body-file /tmp/pr-body.md
```

## Validate before you push

**Validate each commit message with `core-validate-commit`.** It is the same
tool the project runs in CI, so a local run is what makes the commit-lint job
pass on the first attempt. Do not run it against unrelated repositories,
including the skills repository containing this document — its subsystem rule
is specific to `nodejs/node`.

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

CI validates only the first commit of a pull request; the branch-wide command
above covers the rest.

Validate *with* metadata only when inspecting a commit that has already landed
on `main`:

```bash
npx core-validate-commit HEAD   # landed commits only
```

Fix any failure with `git commit --amend` (or an interactive rebase for older
commits) while the branch is still local. If the human sign-off is missing,
amend with the contributor's configured identity:

```bash
git commit --amend --signoff
```

Linting is a separate gate that must also pass before you commit — see
[pre-commit-lint.md](pre-commit-lint.md).

## Upstream sources

- [Current contribution policy](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/CONTRIBUTING.md)
- [Commit message guidelines](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/pull-requests.md#commit-message-guidelines)
- [Pull request template](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/.github/PULL_REQUEST_TEMPLATE.md)
- [Pull request guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/pull-requests.md)
- [Large pull request guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/large-pull-requests.md)
- [Supported subsystems](https://github.com/nodejs/core-validate-commit/blob/main/lib/rules/subsystem.js)
