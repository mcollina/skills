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

```
subsystem: short description

Longer explanation of the change if needed.
Can span multiple paragraphs.

Fixes: https://github.com/nodejs/node/issues/12345
Refs: https://github.com/nodejs/node/pull/12344
```

Examples:

```
# Bug fix
fs: fix race condition in readdir

# New feature
stream: add toArray method

# Test
test: add missing coverage for http

# Documentation
doc: clarify buffer.slice behavior

# Build
build: fix gyp warnings on Windows
```

### Code Style

For lint and formatting commands, see
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

```bash
# Push to your fork
git push origin fix-issue-12345

# Create PR via GitHub CLI
gh pr create \
  --title "fs: fix race condition in readdir" \
  --body "Fixes #12345

This PR addresses the race condition in fs.readdir() by...

**Test plan:**
- Added test in test/parallel/test-fs-readdir-race.js
- Ran existing fs tests
"
```

### PR Requirements

1. **Tests**: Must include tests for changes
2. **Documentation**: Update docs for new features
3. **Commits**: Clean, atomic commits with proper format
4. **CI**: All CI checks must pass
5. **Review**: At least one collaborator approval

### CI Checks

PRs run through extensive CI:

```
├── lint (code style)
├── test-linux (Ubuntu)
├── test-macos
├── test-windows
├── test-asan (Address Sanitizer)
├── test-valgrind
└── coverage
```

### Addressing Review Feedback

```bash
# Make changes based on review
git add .
git commit -m "address review feedback"
git push origin fix-issue-12345

# Squash if needed
git rebase -i HEAD~3
git push --force origin fix-issue-12345
```

## Landing Process

### For Collaborators

```bash
# Fetch PR
git fetch upstream pull/12345/head:pr-12345
git checkout pr-12345

# Review changes
git log upstream/main..HEAD
git diff upstream/main

# Land (after approval)
git checkout main
git pull upstream main
git merge --squash pr-12345

# Add metadata
git commit --amend
# Add: PR-URL: https://github.com/nodejs/node/pull/12345
# Add: Reviewed-By: Name <email>

# Push
git push upstream main
```

### Commit Metadata

```
subsystem: description

Detailed explanation of the change.

PR-URL: https://github.com/nodejs/node/pull/12345
Fixes: https://github.com/nodejs/node/issues/12344
Reviewed-By: James M Snell <jasnell@gmail.com>
Reviewed-By: Anna Henningsen <anna@addaleax.net>
```

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

// Use primordials for built-ins in internal code
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

- Contributing guide: https://github.com/nodejs/node/blob/main/CONTRIBUTING.md
- Collaborator guide: https://github.com/nodejs/node/blob/main/doc/guides/collaborator-guide.md
- C++ style guide: https://github.com/nodejs/node/blob/main/doc/guides/cpp-style-guide.md
- Building: https://github.com/nodejs/node/blob/main/BUILDING.md
