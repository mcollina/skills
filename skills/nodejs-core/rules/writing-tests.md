---
name: writing-tests
description: Writing tests for Node.js core that pass review - test/common helpers, strict assertions, avoiding flakiness, and keeping the suite fast
metadata:
  tags: testing, test-common, flaky, assertions, contributing, review
---

# Writing Tests for Node.js Core

Almost every change to `lib/` or `src/` needs a test. `test/parallel` is one of
the most heavily reviewed directories in the repository, and the feedback is
repetitive: wrong helper, weak assertion, a `setTimeout` standing in for
synchronization, or a test that makes the suite slower for everyone.

Canonical source: [doc/contributing/writing-tests.md][]. This rule covers that
plus what reviewers ask for on top of it.

## Test anatomy

```js
'use strict';

const common = require('../common');
const tmpdir = require('../common/tmpdir');

// This test ensures that fs.readFile() returns the contents written by
// fs.writeFileSync() when a utf8 encoding is requested.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

tmpdir.refresh();

const file = path.join(tmpdir.path, 'read-me.txt');
const expected = 'test content';

fs.writeFileSync(file, expected);

fs.readFile(file, 'utf8', common.mustSucceed((data) => {
  assert.strictEqual(data, expected);
}));
```

Order matters and reviewers notice:

1. `'use strict';`
2. `require('../common')` — **first**, so its global checks are installed
   before anything else runs.
3. A comment saying what the test ensures. Not what the code does — why this
   test exists, so a future contributor can fix it in context when it fails.
4. Everything else: `node:`-prefixed builtins, then the test body.

**One behavior per file.** Do not append cases to an existing test file without
strong motivation. A new test goes in a new file — a minimal, isolated
reproduction is what makes a failure debuggable.

## Naming and placement

Files are kebab-case: `test-<subsystem>-<method-or-event>-<detail>.js`, e.g.
`test-process-before-exit-arrow-functions.js`.

| Directory | Use it when |
| --- | --- |
| `test/parallel` | **Default.** The test can share a machine with others. |
| `test/sequential` | The test cannot run concurrently — binds a fixed port, measures time, depends on global state. |
| `test/es-module` | ESM loading behavior. |
| `test/pummel` | Long-running or load tests. Not run in normal CI. |
| `test/known_issues` | Reproduces a known bug; expected to fail. |
| `test/addons`, `test/node-api`, `test/js-native-api` | Native addon and Node-API surface. |
| `test/internet` | Needs real outbound network. Not run in normal CI. |
| `test/pseudo-tty` | Requires stdin/stdout to be a TTY. |

Putting a test in `sequential` because it is flaky in `parallel` is not a fix —
see [Flakiness](#flakiness-is-a-bug-in-the-test).

## Use the `common` helpers

`test/common` ships 40+ helper modules. Reviewers replace hand-rolled logic with
them routinely, so reach for them first.

### Callback assertions

```js
common.mustCall(fn[, exact])        // must be called exactly `exact` times (default 1)
common.mustCallAtLeast(fn[, min])   // must be called at least `min` times
common.mustNotCall([msg])           // must never be called
common.mustSucceed(fn)              // mustCall + asserts the error argument is falsy
```

**Prefer `common.mustSucceed(cb)` over `common.mustCall((err, ...) => {
assert.ifError(err); ... })`.** It is the current idiom and reads better in a
failure report.

```js
// Reviewers will ask you to change this:
fs.readFile(file, common.mustCall((err, data) => {
  assert.ifError(err);
  assert.strictEqual(data.toString(), expected);
}));

// to this:
fs.readFile(file, common.mustSucceed((data) => {
  assert.strictEqual(data.toString(), expected);
}));
```

### Temporary files

Never write into the repository or the system temp directory directly.

```js
const tmpdir = require('../common/tmpdir');

tmpdir.refresh();              // create/empty the per-test temp dir — call it before use
tmpdir.path                    // the directory path
tmpdir.resolve('sub', 'f.txt') // resolve a path inside it
tmpdir.fileURL('f.txt')        // the same as a file: URL
tmpdir.hasEnoughSpace(bytes)   // guard for large-file tests
```

`common.tmpDir` does **not** exist. If you see it in older material, it is wrong.

### Fixtures

```js
const fixtures = require('../common/fixtures');

fixtures.path('a.js')       // absolute path into test/fixtures
fixtures.fileURL('a.js')    // as a file: URL
fixtures.readSync('a.js')   // contents
fixtures.readKey('agent1-key.pem')  // a TLS key/cert fixture
```

### Child processes

```js
const { spawnSyncAndExitWithoutError, spawnSyncAndAssert, spawnSyncAndExit } =
  require('../common/child_process');

spawnSyncAndExitWithoutError(process.execPath, ['--some-flag', __filename]);

spawnSyncAndAssert(process.execPath, [script], {
  stdout: /expected output/,
  stderr: '',
});
```

`common.spawnPromisified(cmd, args, options)` returns
`{ code, signal, stdout, stderr }` as a promise for async tests.

### Counting completions

```js
const Countdown = require('../common/countdown');

const countdown = new Countdown(3, common.mustCall(() => server.close()));
// ... countdown.dec() from each of the three callbacks
```

### Environment guards

Skip rather than fail when a capability is missing:

```js
if (!common.hasCrypto) common.skip('missing crypto');
if (!common.hasIntl) common.skip('missing Intl');
if (common.isWindows) common.skip('POSIX-only');
```

Other frequently used flags: `common.isLinux`, `common.isMacOS`, `common.isPi`,
`common.isDebug`, `common.isASan`, `common.hasSQLite`, `common.hasInspector`,
`common.hasFullICU`, `common.canCreateSymLink()`.

## Assertions

Always the strict forms:

* `assert.strictEqual()`, never `assert.equal()`
* `assert.deepStrictEqual()`, never `assert.deepEqual()`

For errors, **assert on the `code`, not the message**. Messages are not part of
the API contract and rewording one should not break a test:

```js
assert.throws(
  () => fs.readFileSync(Symbol('nope')),
  { code: 'ERR_INVALID_ARG_TYPE' },
);

await assert.rejects(
  fsPromises.readFile(Symbol('nope')),
  { code: 'ERR_INVALID_ARG_TYPE' },
);
```

A test that asserts an exception was thrown but not *which* exception will be
flagged: it passes when the code throws for an entirely unrelated reason.

For errors thrown by user code rather than Node.js internals, a full anchored
message regex is appropriate: `/^Error: Wrong value$/`, not `/Wrong value/`.

## Flakiness is a bug in the test

This is the single most common source of review friction on tests.

**Do not use `setTimeout` to wait for something.** A timeout that is long
enough on your laptop is not long enough on a loaded CI machine, and the test
becomes a recurring CI failure that everyone learns to ignore. Reviewers
consistently replace timers with a real signal:

```js
// Rejected — a guess dressed up as synchronization:
setTimeout(() => {
  assert.strictEqual(state, 'done');
}, 100);

// Use the actual completion signal:
await once(emitter, 'done');
assert.strictEqual(state, 'done');

// Or yield a turn deterministically:
await setImmediate();

// Or wire the callback explicitly:
const { promise, resolve } = Promise.withResolvers();
thing.on('done', resolve);
await promise;
```

Keeping the event loop alive while waiting for something that must *not* happen:

```js
const keepAlive = setInterval(common.mustNotCall(), 10_000);
// ... later
clearInterval(keepAlive);
```

If a timer is genuinely part of what you are testing, wrap the duration so
slower platforms get more room:

```js
const timer = setTimeout(fail, common.platformTimeout(4000));
```

Prove a new or changed test is stable before pushing:

```bash
tools/test.py --repeat=1000 test/parallel/test-my-thing.js
```

Marking a test `flaky` is a last resort, and needs a linked issue. The
expectation is that you fix the race.

## Keep the suite fast

Test-suite runtime is actively policed. Reviewers have blocked PRs for
inflating it — `make jstest -j16` roughly doubled over one release cycle, and
slow tests make CI capacity the bottleneck for everyone.

Practical consequences:

* Do not add `setTimeout` delays to "make sure" something settled —
  `setImmediate` or the real event is both correct and instant.
* Do not spawn a child process where an in-process assertion works.
* Scale down loop counts to the smallest number that still exercises the bug.
* If your test needs to be slow, it probably belongs in `test/pummel`.

Compare before and after when you touch a shared or frequently-run test:

```bash
tools/test.py --repeat=100 test/parallel/test-my-thing.js   # on main, then on your branch
```

## Flags and internals

To run a test under specific CLI flags, declare them in the preamble — the test
runner reads the comment:

```js
// Flags: --expose-internals --allow-natives-syntax

require('../common');
const assert = require('node:assert');
const { validateString } = require('internal/validators');
```

Tests that do not use anything from `common` still `require('../common')` for
its global leak detection.

## Checklist

* [ ] New file, kebab-cased, named for the subsystem and behavior.
* [ ] `'use strict';` then `require('../common')` first.
* [ ] A comment saying what the test ensures and why.
* [ ] In `parallel` unless it genuinely cannot be.
* [ ] `common.mustCall` / `mustSucceed` / `mustNotCall` around every callback.
* [ ] `tmpdir.refresh()` if it touches the filesystem.
* [ ] Strict assertions; error assertions check `code`.
* [ ] No `setTimeout` used as synchronization.
* [ ] `tools/test.py --repeat=1000 <test>` is green.
* [ ] Rebuilt (`make -j$(nproc)`) before running — see
      [build-and-test-workflow.md](build-and-test-workflow.md).

## References

* [doc/contributing/writing-tests.md][]
* [test/README.md](https://github.com/nodejs/node/blob/HEAD/test/README.md) — the directory table
* [test/common/README.md](https://github.com/nodejs/node/blob/HEAD/test/common/README.md) — full helper reference
* [internal-errors.md](internal-errors.md) — asserting on error codes
* [build-and-test-workflow.md](build-and-test-workflow.md) — running the suite

[doc/contributing/writing-tests.md]: https://github.com/nodejs/node/blob/HEAD/doc/contributing/writing-tests.md
