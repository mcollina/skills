---
name: pre-commit-lint
description: Mandatory lint, format, and commit-message validation gate to run for every nodejs/node commit so the Linters and commit-lint CI jobs pass on the first attempt
metadata:
  tags: lint, format, pre-commit, ci, eslint, cpplint, clang-format, core-validate-commit, commit-message, workflow
---

# Lint and Validate Every Commit

**Run the linters before every commit, and validate the commit message right
after writing it — not just before pushing.** Node.js runs a `Linters`
workflow and a commit-message workflow on every non-draft pull request. A
failure in either means a red CI run, a force-push, and another full CI
cycle — all for something that takes seconds locally.

Three facts make this easy to get wrong:

1. **`make test` does not run any linter on Unix.** Only Windows
   (`vcbuild test`) folds linting into the test run. A green `make test` on
   Linux/macOS says nothing about whether CI's lint jobs will pass.
2. **`make lint` does not cover every CI lint job.** It skips Python, shell,
   and C++ formatting checks. See the table below.
3. **Commit messages are linted too**, by `core-validate-commit`, and no
   `make` target runs it.

## The Gate

Run this after building and before `git commit`:

```bash
make lint
```

If you touched C++, also run the formatter against your branch (see
[C++ formatting](#c-formatting-the-most-common-ci-lint-failure) — the default
invocation only covers *staged* changes, which is not what CI checks):

```bash
CLANG_FORMAT_START="$(git merge-base HEAD upstream/main)" make format-cpp
git --no-pager diff --exit-code   # must be empty, or amend the formatting in
```

If you touched Python, shell, or YAML, run the extra targets that `make lint`
skips:

```bash
make lint-py-build && make lint-py     # only needed once for the -build step
tools/lint-sh.mjs .                    # requires shellcheck on PATH
```

Only commit once all of these are clean, and always commit with `-s`:

```bash
git add -A && git commit -s
```

**`-s` is not optional.** It adds the `Signed-off-by:` trailer that certifies
the Developer Certificate of Origin; without it the `signed-off-by` rule fails
in the commit-lint job and the change cannot land. It must carry the human
contributor's name and email — never a tool or AI identity. Recover a missing
sign-off with `git commit --amend --signoff`.

Then validate the commit message you just wrote — Node.js runs a commit-lint
CI job too:

```bash
npx core-validate-commit --no-validate-metadata HEAD
```

## Validate the Commit Message

`core-validate-commit` is the same tool the project runs in CI (the
"First commit message adheres to guidelines" workflow). Run it after every
commit; it takes commit SHAs, so it necessarily runs after `git commit`
rather than before. Fix failures with `git commit --amend` while the commit
is still local.

```bash
# The commit you just made:
npx core-validate-commit --no-validate-metadata HEAD

# Every commit on the branch (CI only checks the first one — check them all):
git rev-list upstream/main..HEAD | xargs npx core-validate-commit --no-validate-metadata
```

**Always pass `--no-validate-metadata`.** Metadata validation is *on by
default* (`-V, --validate-metadata`), and it enforces the `PR-URL:` and
`Reviewed-By:` trailers that only exist on a **landed** commit. Running the
bare `npx core-validate-commit HEAD` against your own unlanded commit
therefore reports `pr-url` and `reviewers` failures that are correct and
expected — they are not something to fix.

**Never add `PR-URL:` to your commit message to silence those errors.**
`PR-URL:` and `Reviewed-By:` are added by the landing process (the commit
queue or `git node land`) from the pull request and its approvals. A
hand-written `PR-URL:` is wrong — you cannot know the PR number before
opening the PR, and an invented or stale one ends up in the permanent
history. The same applies to `Reviewed-By:`. Put `Fixes:` and `Refs:` lines
in the **pull request body**, not in the commit; landing copies them across.

Validate *with* metadata only when inspecting an already-landed commit:

```bash
npx core-validate-commit HEAD   # landed commits only
```

The rules it enforces are `subsystem`, `title-format`, `title-length`,
`line-after-title`, `line-length`, `signed-off-by`, `metadata-end`,
`fixes-url`, `co-authored-by-is-trailer`, and `assisted-by-is-trailer`, plus
the two metadata rules skipped by `--no-validate-metadata`. See
[commit-and-pr-guideline.md](commit-and-pr-guideline.md) for the house style those rules
encode.

Do not run `core-validate-commit` outside a `nodejs/node` checkout; its
subsystem rule is specific to that repository.

## What `make lint` Runs, and What It Misses

`make lint` runs exactly: `lint-js`, `lint-cpp`, `lint-addon-docs`,
`lint-md`, `lint-yaml`.

| CI job (`.github/workflows/linters.yml`) | Local command                                     | In `make lint`? |
| ---------------------------------------- | ------------------------------------------------- | --------------- |
| `lint-js-and-md` (JS half)               | `make lint-js` / `make lint-js-fix`                | yes             |
| `lint-js-and-md` (MD half)               | `make lint-md` / `make format-md`                  | yes             |
| `lint-cpp`                               | `make lint-cpp`                                    | yes             |
| `lint-addon-docs`                        | `make lint-addon-docs`                             | yes             |
| `lint-yaml`                              | `make lint-yaml-build` then `make lint-yaml`       | yes (lint only) |
| `format-cpp`                             | `CLANG_FORMAT_START=... make format-cpp`           | **no**          |
| `lint-py`                                | `make lint-py-build` then `make lint-py`           | **no**          |
| `lint-sh`                                | `tools/lint-sh.mjs .`                              | **no**          |
| `lint-readme`                            | `tools/lint-readme-lists.mjs`                      | **no**          |
| `lint-pr-url`                            | (PR-only; see below)                               | **no**          |
| `lint-commit-message` (commit-lint.yml)  | `npx core-validate-commit --no-validate-metadata HEAD` | **no**      |

The `-build` targets (`lint-py-build`, `lint-yaml-build`,
`format-cpp-build`) install tooling and need network access. Run them once
per checkout; after that only the lint target itself is needed.

On Windows the equivalent is `vcbuild.bat lint` (which covers C++, JS, and
Markdown only).

## Scope-Based Checklist

Match the checks to what you actually changed.

**Changed `lib/` or any JavaScript:**

```bash
make lint-js        # or: make lint-js-fix to auto-correct
```

CI runs ESLint with `--max-warnings=0 --report-unused-disable-directives`.
A warning fails the build, and an unused `eslint-disable` comment fails it
too — so delete disable comments once the code no longer needs them. Linted
targets are `eslint.config.mjs benchmark doc lib test tools`; note that
`src/` is **not** an ESLint target and `deps/` is excluded.

**Changed `src/` or any C++:**

```bash
make format-cpp     # see the branch-wide form below
make lint-cpp
```

**Changed `doc/` or any Markdown:**

```bash
make lint-md        # or: make format-md to auto-fix
```

`make lint-md` also depends on `lint-js-doc`, which lints the JavaScript code
samples embedded in `doc/`, and on a manpage check that verifies `doc/node.1`
is current — if you changed `doc/api/cli.md`, regenerate it with
`make node.1`.

**Changed `.py` files, `configure.py`, or anything under `tools/`:**

```bash
make lint-py
```

**Changed `.sh` files:**

```bash
tools/lint-sh.mjs .
```

**Changed `.yml` / `.yaml` (including workflow files):**

```bash
make lint-yaml
```

**Changed `README.md` collaborator/TSC lists:**

```bash
tools/lint-readme-lists.mjs
```

## C++ Formatting: The Most Common CI Lint Failure

`make format-cpp` defaults to `CLANG_FORMAT_START=HEAD`, which formats only
**staged** changes. CI instead formats everything from the merge base with
the target branch and fails if that produces any diff. So a change that was
committed unformatted earlier in the branch passes locally and fails in CI.

Format the whole branch the way CI does:

```bash
make format-cpp-build   # one time, installs clang-format tooling

CLANG_FORMAT_START="$(git merge-base HEAD upstream/main)" make format-cpp
git --no-pager diff --exit-code
```

An empty diff means CI's `format-cpp` job will pass. A non-empty diff is the
formatting you still need to fold into your commits (`git add -p` plus
`git commit --amend`, or a fixup commit).

Note that `format-cpp` (clang-format, style) and `lint-cpp` (cpplint plus
`checkimports.py`, correctness and include hygiene) are separate checks with
separate CI jobs. Passing one says nothing about the other.

## Stamp Files Make Lint Runs Incremental

`lint-cpp`, `lint-md`, and `lint-addon-docs` are driven by stamp files
(`tools/.cpplintstamp`, `tools/.mdlintstamp`, `tools/.doclintstamp`) and only
process files newer than the stamp. ESLint additionally uses `--cache`.

This is normally what you want — it is why running lint before every commit
is cheap. But it means a clean local run can hide a failure on a file you
touched before the stamp was written, or after rebasing/checking out
branches. When a local run passes and CI disagrees, reset the caches:

```bash
make lint-clean     # removes stamps, .eslintcache, and lint tool node_modules
make lint
```

`lint-clean` also removes `tools/eslint/node_modules` and
`tools/lint-md/node_modules`, so the next `make lint` re-runs `npm ci` for
those and needs network access.

## Documentation YAML and `lint-pr-url`

When adding or deprecating a public API, the doc YAML version must be
`REPLACEME` — the release process substitutes the real version:

```markdown
### `request.method`
<!-- YAML
added: REPLACEME
-->
```

The `lint-pr-url` CI job validates that any `pr-url:` value you add in a doc
YAML block matches the URL of the pull request introducing it. You cannot
know that URL before opening the PR, so leave `pr-url:` out of the initial
commit for new entries and fill it in only when a `pr-url:` is genuinely
required for a backport or a changes entry.

## Commit Loop

```bash
$EDITOR src/... lib/... doc/...
make -j$(nproc)                                   # rebuild (mandatory)
make lint                                         # lint gate
CLANG_FORMAT_START="$(git merge-base HEAD upstream/main)" make format-cpp
./node test/parallel/test-your-feature.js         # targeted test
git add -A && git commit -s                       # only now
npx core-validate-commit --no-validate-metadata HEAD   # amend if it fails
```

If lint fails, fix it and re-run before committing — do not commit "will fix
lint in a follow-up". Squashing lint fixes into the original commit later is
extra work for you and extra CI cycles for the project's shared infra.

## References

- CI definitions: `.github/workflows/linters.yml` and
  `.github/workflows/commit-lint.yml` in the Node.js repo
- Lint targets: the `lint` / `lint-ci` section of `Makefile`
- `doc/contributing/pull-requests.md` — "please be sure to run `make lint`"
- Full build and test cycle: [build-and-test-workflow.md](build-and-test-workflow.md)
