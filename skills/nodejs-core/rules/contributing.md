---
name: contributing
description: How to contribute to Node.js core, the process
metadata:
  tags: contributing, nodejs-core, pull-request, governance
---

# Contributing to Node.js Core

This guide covers the process of contributing to the Node.js project, from finding issues to landing commits.

## Getting Started

### Setting Up the Development Environment

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/node.git
cd node

# Add upstream remote
git remote add upstream https://github.com/nodejs/node.git
```

For building, linting, and testing, see
[build-and-test-workflow.md](build-and-test-workflow.md).

### Understanding the Repository Structure

```
node/
├── src/                 # C++ source code
│   ├── node.cc          # Entry point
│   ├── node_*.cc        # Core modules (C++)
│   └── crypto/          # Crypto implementation
├── lib/                 # JavaScript source code
│   ├── internal/        # Internal modules
│   └── *.js             # Public API modules
├── deps/                # Dependencies
│   ├── v8/              # V8 engine
│   ├── uv/              # libuv
│   └── openssl/         # OpenSSL
├── test/                # Tests
│   ├── parallel/        # Parallel tests
│   ├── sequential/      # Sequential tests
│   └── fixtures/        # Test fixtures
├── doc/                 # Documentation
├── tools/               # Build tools
└── benchmark/           # Benchmarks
```

## Finding Work

### Good First Issues

```bash
# Browse issues labeled "good first issue"
# https://github.com/nodejs/node/labels/good%20first%20issue

# Or use GitHub CLI
gh issue list --label "good first issue" --repo nodejs/node
```

### Issue Labels

| Label | Description |
|-------|-------------|
| `good first issue` | Suitable for newcomers |
| `help wanted` | Needs contributor help |
| `confirmed-bug` | Verified bug |
| `feature request` | New feature proposal |
| `semver-major` | Breaking change |
| `semver-minor` | New feature |
| `semver-patch` | Bug fix |

### Where to Contribute

- **Documentation**: `doc/` directory
- **Tests**: `test/` directory
- **JavaScript**: `lib/` directory
- **C++**: `src/` directory
- **Build**: `configure`, `Makefile`, GYP files

## Making Changes

### Creating a Branch

```bash
# Update main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b fix-issue-12345
```

### Commit Message Format

Use [commit-and-pr-guideline.md](commit-and-pr-guideline.md) for the Node.js house style
and current DCO requirements. The default authored form is:

```text
subsystem[,subsystem...]: imperative description

Optional explanation of the previous behavior and why the change is needed.

Signed-off-by: Human Contributor <human@example.com>
```

Create the sign-off with `git commit -s`; never fabricate another person's
identity. Put full-URL `Fixes:` and `Refs:` lines in the pull request body so
the landing process can add them to the landed commit. Never write a `PR-URL:`
or `Reviewed-By:` trailer yourself — landing adds those.

Validate each commit before pushing, using the same invocation as CI:

```bash
npx core-validate-commit --no-validate-metadata HEAD

# Or the whole branch:
git rev-list upstream/main..HEAD | xargs npx core-validate-commit --no-validate-metadata
```

`--no-validate-metadata` is required for unlanded commits: metadata validation
is on by default and fails on the missing `PR-URL:` and `Reviewed-By:`
trailers, which is expected and must not be "fixed" by adding them.

### Code Style

Run `make lint` before every commit — the `Linters` CI workflow runs on every
non-draft pull request, and `make test` does not lint on Unix. For the full
pre-commit gate, including the C++ formatter and the CI jobs `make lint` does
not cover, see [pre-commit-lint.md](pre-commit-lint.md). For the rest of the
lint and formatting commands, see
[build-and-test-workflow.md](build-and-test-workflow.md#lint).

### Writing Tests

```javascript
// test/parallel/test-fs-read.js
'use strict';
const common = require('../common');
const assert = require('assert');
const fs = require('fs');

// Test description
{
  const expected = 'test content';
  const file = common.tmpDir + '/test-file.txt';

  fs.writeFileSync(file, expected);

  fs.readFile(file, 'utf8', common.mustCall((err, data) => {
    assert.ifError(err);
    assert.strictEqual(data, expected);
  }));
}

// Use common.mustCall() to ensure callbacks are called
// Use common.mustNotCall() to ensure callbacks are not called
// Use assert.throws() for expected errors
```

### Running Tests

For build, test, and workflow commands, see
[build-and-test-workflow.md](build-and-test-workflow.md#test).

```bash
# Run benchmarks
node benchmark/fs/readfile.js
```

## Pull Request Process

### Creating a PR

Use the terse style in
[commit-and-pr-guideline.md](commit-and-pr-guideline.md). Write the body to
a file so Markdown is preserved:

```bash
# Push to your fork.
git push origin fix-issue-12345

cat > /tmp/pr-body.md <<'EOF'
Prevent concurrent readdir operations from reusing a closed request handle.
The regression test exercises the overlapping-call path.

Fixes: https://github.com/nodejs/node/issues/12345
EOF

gh pr create \
  --repo nodejs/node \
  --base main \
  --head YOUR_USERNAME:fix-issue-12345 \
  --title "fs: avoid reusing closed readdir requests" \
  --body-file /tmp/pr-body.md
```

### PR Requirements

1. **Tests**: Include tests for bug fixes and new features.
2. **Documentation**: Update documentation for public behavior and APIs.
3. **Commits**: Keep logical changes self-contained and signed off.
4. **CI**: Required CI must pass; inspect failures rather than assuming they
   are unrelated. Lint locally before committing
   ([pre-commit-lint.md](pre-commit-lint.md)) — lint failures are the
   cheapest CI failures to avoid and the most annoying to leave for a
   reviewer to point out.
5. **Review**: Two collaborator approvals are normally required; one is enough
   after the PR has been open for more than seven days.
6. **Wait time**: Leave non-trivial changes open for at least 48 hours.

### CI Checks

Code changes must pass the Node.js CI runs triggered by collaborators or
triagers. Inspect every failure to distinguish regressions from known flaky
tests or infrastructure failures; rerun CI after new code is pushed.

### Addressing Review Feedback

Keep review updates visible. Do not squash approved commits merely to make the
PR look tidy; the landing process normally handles autosquashing. A fixup
commit can identify its target explicitly:

```bash
make lint                              # lint gate applies to fixups too
git add my/changed/files
git commit -s --fixup <target-commit>
git push origin fix-issue-12345
```

Rebase onto upstream only when needed, and use `--force-with-lease` rather than
`--force` after rewriting branch history.

## Landing Process

Collaborators should use the commit queue or `git node land`; they must not use
GitHub's green merge button. Before landing:

1. Confirm required approvals, wait time, and green CI.
2. Validate the final commit message and human DCO sign-off.
3. Add landing metadata from the PR and its reviews.
4. Usually squash to one logical change; preserve several commits only when
   each is self-contained and passes all tests.

The landing process produces `PR-URL:`, `Reviewed-By:`, and other final
metadata. Authors should not invent it in the PR description.

```text
subsystem: imperative description

Optional rationale.

Signed-off-by: Human Contributor <human@example.com>
PR-URL: https://github.com/nodejs/node/pull/12345
Fixes: https://github.com/nodejs/node/issues/12344
Reviewed-By: Reviewer Name <reviewer@example.com>
```

See the pinned
[collaborator guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/collaborator-guide.md#landing-pull-requests)
and [commit queue guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/commit-queue.md)
for the current landing workflow.

## Governance

### Working Groups

- **TSC (Technical Steering Committee)**: Technical direction
- **Collaborators**: Commit access, can merge PRs
- **Contributors**: Anyone who contributes

### Becoming a Collaborator

1. Make quality contributions over time
2. Be nominated by existing collaborator
3. Pass consensus-based vote

### Decision Making

```
1. Consensus seeking
2. If no consensus, TSC vote
3. Lazy consensus for routine changes
4. Explicit approval for breaking changes
```

## C++ Contribution Guidelines

### Style Guide

```cpp
// Use 2-space indentation
// Use snake_case for variables and functions
// Use PascalCase for classes
// Use SCREAMING_CASE for macros

class MyClass : public BaseClass {
 public:  // 1 space before public/private
  void DoSomething();

 private:
  int my_variable_;  // Trailing underscore for members
};

// Wrap at 80 characters
// Use nullptr, not NULL
// Prefer std::unique_ptr over raw pointers
```

### Error Handling

```cpp
// Use Maybe<T> for operations that can fail
v8::MaybeLocal<v8::Value> result = SomeOperation();
if (result.IsEmpty()) {
  // Handle error
  return;
}
v8::Local<v8::Value> value = result.ToLocalChecked();

// Use CHECK macros for invariants
CHECK_NOT_NULL(env);
CHECK_EQ(status, 0);
CHECK_GE(length, 0);
```

## JavaScript Contribution Guidelines

### Style

```javascript
'use strict';  // Always include

// Use const/let, never var
const x = 1;
let y = 2;

// Use arrow functions for callbacks
array.map((item) => item.value);

// Destructuring
const { a, b } = obj;

// Template literals
const message = `Value is ${value}`;

// Use primordials for built-ins in internal code (see primordials.md)
const {
  ArrayPrototypeMap,
  ObjectDefineProperty,
} = primordials;
```

### Internal Modules

```javascript
// lib/internal/my_module.js
'use strict';

const {
  ArrayIsArray,
} = primordials;

// Internal binding
const { myBinding } = internalBinding('my_binding');

// Validators
const {
  validateString,
  validateNumber,
} = require('internal/validators');

function myFunction(arg) {
  validateString(arg, 'arg');
  // Implementation
}

module.exports = {
  myFunction,
};
```

## Backporting

### Cherry-picking to Release Lines

```bash
# Checkout release branch
git checkout v18.x

# Cherry-pick commit
git cherry-pick -x <commit-hash>

# Update commit message
git commit --amend
# Add: Backport-PR-URL: https://github.com/nodejs/node/pull/12346
```

### When to Backport

- Security fixes: Always
- Bug fixes: If safe and requested
- Features: Generally not (semver-minor)
- Breaking changes: Never

## Resources

- [Contributing guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/CONTRIBUTING.md)
- [Collaborator guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/collaborator-guide.md)
- [C++ style guide](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/doc/contributing/cpp-style-guide.md)
- [Building Node.js](https://github.com/nodejs/node/blob/cf882a79042cba4146acfdb7993b6a97c21e7239/BUILDING.md)
