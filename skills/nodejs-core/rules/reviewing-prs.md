---
name: reviewing-prs
description: How to review Node.js core pull requests for correctness, clear technical writing, project conventions, and contribution quality
metadata:
  tags: review, pull-request, contributing, quality, writing
---

# Reviewing Pull Requests

A guide for reviewing contributions to the Node.js project, covering technical
quality, writing clarity, and project conventions.

## Technical review checklist

### Commit message

See [commit-and-pr-guideline.md](commit-and-pr-guideline.md) for the full format spec.
During review, check:

- Correct subsystem prefix (`fs:`, `stream:`, `http:`, `test:`, `doc:`, etc.)
- Short imperative description on the first line
- Body explains *why* the change is needed, not just *what* it does
- Full-URL `Fixes:` and `Refs:` lines in the PR description use the correct
  semantics (`Fixes` closes; `Refs` only relates)
- Human-authored commits contain the contributor's DCO `Signed-off-by` line

### Pull request text

See [commit-and-pr-guideline.md](commit-and-pr-guideline.md) for the full
style. During review, check:

- The title is a concise candidate commit subject.
- The opening gives context missing from the title instead of restating it.
- The body names the previous and changed behavior in concrete terms.
- The rationale, limitations, uncertainty, and benchmark evidence are included
  when they affect whether the change should land.
- The prose is plain and matter-of-fact, without hype, canned sections,
  file-by-file narration, or unsupported claims.
- A routine PR stays short; a complex PR uses only the structure needed to make
  the design reviewable.

### Scope

- Is the change narrowly scoped to one subsystem/concern?
- Does it touch only the files necessary? Watch for unrelated reformatting,
  whitespace changes, or drive-by fixes mixed into the PR
- Is the semver classification correct (`semver-major`, `semver-minor`,
  `semver-patch`)?
- Does it need the `notable-change` label?

### Tests

- Are tests present? Changes to `src/` or `lib/` almost always require tests
- Are tests in the right suite? (`test/parallel/` for most tests,
  `test/sequential/` only when tests cannot run concurrently)
- Do the tests exercise the actual changed code path, or are they
  superficial?
- Do tests cover error conditions and edge cases, not just the happy path?
- Do tests use proper `common.js` helpers (`common.mustCall()`,
  `common.mustNotCall()`, platform checks)?
- Are `// Flags:` directives present when the test requires special flags?

### Documentation

- Are `doc/api/` changes included for new or changed public APIs?
- Is `doc/api/cli.md` updated for new CLI flags?
- Does the documentation explain *how to use* the feature, not just restate
  the implementation?
- Are stability markers and version metadata correct?

### Code quality

- **Primordials**: does code in `lib/internal/` use primordials correctly?
  See [primordials.md](primordials.md)
- **Error handling**: uses `ERR_*` codes from `lib/internal/errors.js`?
  Correct error types (`TypeError`, `RangeError`, etc.)?
- **Validators**: uses `require('internal/validators')` for argument
  validation (`validateString`, `validateNumber`, etc.)?
- **Internal bindings**: uses `internalBinding()` for C++ bindings, not
  `process.binding()`?
- **Backwards compatibility**: does the change break existing behavior? Is
  experimental functionality behind a flag?
- **Performance**: are changes in hot paths benchmarked? Are primordials
  used/avoided appropriately for the subsystem?

### Build and CI

- Does CI pass? Are any failures related to the change or known-flaky?
- For C++ changes: does the code compile cleanly? Is `format-cpp` applied?
- For new `lib/` files: is `./configure` needed? (configure discovers JS
  files for `js2c`)

## Quality red flags

These patterns identify concrete review risks and unclear technical writing.

### Commit message red flags

- **Line-by-line narration**: the commit body describes what each line of
  code does rather than explaining the problem being solved and why this
  approach was chosen
- **Overly formal or generic language**: "This commit addresses the issue
  by implementing a solution that..." instead of a direct explanation
- **Copy-pasted issue description**: the commit body is the issue text
  verbatim rather than the contributor's own understanding of the problem

### Code red flags

- **Non-existent APIs**: using functions, options, error codes, or conventions
  that do not exist in the Node.js codebase
- **Inconsistent convention adherence**: some files use Node.js primordials,
  validators, and error codes correctly while adjacent changes do not
- **Over-engineering**: adding unnecessary abstraction, extra classes, or
  complexity for a straightforward fix
- **Boilerplate-heavy code**: excessive JSDoc comments, unnecessary type
  annotations, or verbose variable names that are inconsistent with the
  surrounding code's style
- **Doesn't compile or pass lint**: the contributor never ran the build.
  This is particularly telling because it means the code was never tested
  locally. See [build-and-test-workflow.md](build-and-test-workflow.md)

### Test red flags

- **Tests that test the implementation, not behavior**: asserting internal
  state, mocking internals, or checking that a specific internal function
  was called rather than testing observable outcomes
- **Tests that would pass without the fix**: the test doesn't actually
  exercise the changed code path. Verify by mentally (or actually)
  reverting the fix and checking if the test would still pass
- **Generic test descriptions**: `'should work correctly'` or
  `'test for issue #12345'` rather than describing the specific behavior
  being verified
- **Missing edge cases**: only the happy path is tested. No error
  conditions, no boundary values, no concurrent/timing scenarios where
  relevant
- **Tests that mirror the implementation**: the test is essentially a
  copy of the implementation logic, so it can never catch a bug

### Review interaction red flags

- **Boilerplate responses**: "Thank you for the feedback. I've addressed
  your concern and updated the code accordingly." — without engaging with
  the substance of the review comment
- **Cannot answer "why" questions**: when asked why they chose a particular
  approach, the contributor deflects, restates what the code does, or
  gives a vague answer
- **Fixes that don't match the feedback**: the reviewer asks for a
  specific change, and the contributor makes a different but superficially
  related change without explaining why

## How to handle quality gaps

The goal is constructive, not adversarial. New contributors may be unfamiliar
with Node.js internals or project conventions.

### Ask clarifying questions

Ask specific, technical questions that require understanding of the code:

- "Why did you choose to use X here instead of Y?"
- "What happens if this function receives a null argument?"
- "Can you walk me through what this test verifies and why it's the right
  test for this change?"
- "How does this interact with [related subsystem]?"

These questions are good review practice because they expose correctness and
design gaps while giving the contributor a concrete way to improve the PR.

### Point to project expectations

If the rationale or implementation remains unclear:

- Link to the [contributing guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/CONTRIBUTING.md)
  and the relevant subsystem documentation.
- Ask for a focused explanation, test, benchmark, or code change.
- Suggest studying the relevant subsystem before resubmitting when needed.
- Offer specific, actionable guidance tied to the submitted change.

### Request changes, don't reject outright

- Request changes with specific, actionable feedback
- If the contribution addresses a real issue, acknowledge that — the
  contributor's intent may be good even if the execution needs work
- Suggest they build and test locally before resubmitting, and ask for the
  relevant validation result

## Node.js review workflow

### Using `ncu-ci` to interpret CI

```bash
# Install node-core-utils
npm install -g node-core-utils

# Check CI status for a PR
ncu-ci https://github.com/nodejs/node/pull/12345

# Or by PR number
ncu-ci 12345
```

### Approving a PR

When approving, add a review comment or GitHub approval. Your `Reviewed-By`
line will be added to the commit metadata when the PR lands:

```
Reviewed-By: Your Name <your@email.com>
```

### When to request changes vs. approve with comments

- **Request changes**: the PR has correctness issues, missing tests, or an
  unresolved rationale or design gap that blocks landing
- **Approve with comments**: minor style nits, suggestions for follow-up
  work, or optional improvements. The PR is fundamentally correct and can
  land after the author considers (but doesn't necessarily adopt) your
  suggestions
- **Comment without approval**: you have questions or observations but
  don't feel qualified to approve/block the change in this subsystem

### Labels to check

| Label               | Meaning                                              |
| ------------------- | ---------------------------------------------------- |
| `semver-major`      | Breaking change (requires TSC approval)              |
| `semver-minor`      | New feature (additive, non-breaking)                 |
| `semver-patch`      | Bug fix                                              |
| `notable-change`    | Should appear in release notes                       |
| `needs-ci`          | CI has not been run yet                              |
| `request-ci`        | CI requested                                         |
| `author ready`      | Author considers PR ready for review                 |
| `dont-land-on-*`    | Do not land on specific release lines                |

## References

- [Current contributing policy](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/CONTRIBUTING.md)
- [Pull request and review guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/pull-requests.md)
- [Collaborator guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/collaborator-guide.md)
- Commit message and PR description style:
  [commit-and-pr-guideline.md](commit-and-pr-guideline.md)
- Build/test workflow: [build-and-test-workflow.md](build-and-test-workflow.md)
- Primordials: [primordials.md](primordials.md)
