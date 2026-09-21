---
name: documentation
description: Updating doc/api/*.md files - structure, link ordering, error docs, code example constraints
metadata:
  tags: documentation, docs, api, markdown, lint, contributing
---

# Updating Node.js API Documentation

Rules and conventions for writing and updating `doc/api/*.md` files.

## Doc File Structure

### New API doc files

1. Create the file in `doc/api/` (e.g., `doc/api/zlib_iter.md`)
2. Add an entry to `doc/api/index.md` in alphabetical order
3. Start with a title, `introduced_in` comment, stability indicator, and
   `source_link` comment:

```markdown
# Module Name

<!--introduced_in=REPLACEME-->

> Stability: 1 - Experimental

<!-- source_link=lib/module.js -->

Description of the module.
```

### YAML metadata blocks

Every new API entry needs a YAML metadata block:

```markdown
### `myMethod(arg1[, arg2])`

<!-- YAML
added: REPLACEME
-->

* `arg1` {string} Description.
* `arg2` {Object} Optional description.
  * `option1` {number} **Default:** `42`.
* Returns: {Promise}

Description of what the method does.
```

Use `REPLACEME` for the version — it is replaced automatically at release time.

For changes to existing APIs, add a `changes` entry:

```markdown
<!-- YAML
added: v16.0.0
changes:
  - version: REPLACEME
    pr-url: https://github.com/nodejs/node/pull/XXXXX
    description: Added the `signal` option.
-->
```

### Stability indicators

Experimental APIs need a stability indicator after the YAML block:

```markdown
> Stability: 1 - Experimental
```

Stability levels: `0 - Deprecated`, `1 - Experimental`, `2 - Stable`.

### Parameter list format

* Use `{type}` for parameter types: `{string}`, `{number}`, `{Object}`,
  `{Buffer}`, `{AbortSignal}`, `{stream.Readable}`, etc.
* Optional parameters use `[, param]` in the heading
* Default values use `**Default:** \`value\``
* Nested options are indented with two spaces

### Method ordering

API methods within a doc file should be listed in alphabetical order.

## Link Reference Definitions (CRITICAL)

**This is the most common source of lint failures when updating docs.**

All link reference definitions go at the bottom of the markdown file.
The markdown linter (`make lint-md`) enforces strict ordering.

### Sort rules

The sort is **ASCII lexical order**, which means:

1. **Uppercase letters sort before lowercase:** `[A-Z]` before `[a-z]`
2. **Backtick-quoted references** like `` [`foo()`] `` sort by the text
   inside the backticks (including the backticks in the sort key)
3. **Within the same case**, normal alphabetical order applies

### Practical consequences

| Reference A              | Reference B                 | Correct order     | Why                       |
| ------------------------ | --------------------------- | ----------------- | ------------------------- |
| `` [`ERR_MISSING_OPTION`] `` | `` [`EventEmitter`] ``          | ERR first         | `E`, `R` < `E`, `v`               |
| `` [`Stream.toAsync...`] ``  | `` [`readable.push('')`] ``     | Stream first      | uppercase `S` < lowercase `r` |
| `` [`fromSync()`] ``         | `` [`fs.createReadStream()`] `` | fromSync first    | `f`, `r` < `f`, `s`               |
| `` [`stream/iter`] ``        | `` [`stream.wrap()`] ``         | stream.wrap first | `.` < `/` in ASCII            |
| `[stream-end]`             | `[stream-iter-from]`          | stream-end first  | `e` < `i`                     |
| `[child process stdin]`    | `[crypto]`                    | child first       | `c`, `h` < `c`, `r`               |

### Example: correct reference block ordering

```markdown
[`ERR_INVALID_ARG_TYPE`]: errors.md#err_invalid_arg_type
[`EventEmitter`]: events.md#class-eventemitter
[`Stream.toAsyncStreamable`]: stream_iter.md#streamtoasyncstreamable
[`fromSync()`]: stream_iter.md#fromsyncinput
[`fs.createReadStream()`]: fs.md#fscreatereadstreampath-options
[`process.stdout`]: process.md#processstdout
[`pull()`]: stream_iter.md#pullsource-transforms-options
[`readable.push('')`]: #readablepush
[`stream.Readable.from()`]: #streamreadablefromiterable-options
[`stream.addAbortSignal()`]: #streamaddabortsignalsignal-stream
[`stream/iter`]: stream_iter.md
[child process stdin]: child_process.md#subprocessstdin
[stream-end]: #writableendchunk-encoding-callback
[stream-iter-from]: stream_iter.md#frominput
```

**Key insight:** All backtick-quoted refs (`` [`...`] ``) sort among
themselves, then all unquoted refs (`[...]`) sort among themselves.
Within each group, it is strict ASCII order.

### Workflow tip

When adding new link references, **do not guess the position**. Instead:

1. Add the reference anywhere at the bottom
2. Run `make lint-md`
3. The warning message tells you exactly where it should go:
   `Unordered reference ("X" should be before "Y")`
4. Move it to the correct position
5. Repeat until clean

Typically 1-2 iterations are needed. The error messages are precise.

## Error Documentation

New error codes require changes in **two** files, both with strict alphabetical
ordering enforced by separate ESLint rules.

### `lib/internal/errors.js`

Add the `E()` call in alphabetical order among existing error codes.
The `node-core/alphabetize-errors` ESLint rule enforces this.

```javascript
// Correct — ERR_STREAM_ITER_MISSING_FLAG between ERR_STREAM_DESTROYED
// and ERR_STREAM_NULL_VALUES
E('ERR_STREAM_DESTROYED', 'Cannot call %s after a stream was destroyed', Error);
E('ERR_STREAM_ITER_MISSING_FLAG',
  'The stream/iter API requires the --experimental-stream-iter flag', TypeError);
E('ERR_STREAM_NULL_VALUES', 'May not write null values to stream', TypeError);
```

### `doc/api/errors.md`

Add an `<a id="ERR_*">` anchor and description in alphabetical order.
The `node-core/documented-errors` ESLint rule enforces this — it parses
`errors.md` and verifies the anchors match the error codes in `errors.js`
and are correctly ordered.

```markdown
<a id="ERR_STREAM_DESTROYED"></a>

### `ERR_STREAM_DESTROYED`

A stream method was called that cannot complete because the stream was
destroyed using `stream.destroy()`.

<a id="ERR_STREAM_ITER_MISSING_FLAG"></a>

### `ERR_STREAM_ITER_MISSING_FLAG`

A stream/iter API was used without the `--experimental-stream-iter` CLI flag
enabled.

<a id="ERR_STREAM_NULL_VALUES"></a>
```

## Code Examples in Documentation

### Dual CJS/ESM examples required

Every code example must have both CommonJS and ESM variants. Use
fenced code blocks with `mjs` and `cjs` language tags:

````markdown
```mjs
import { Readable } from 'node:stream';
import { from, text } from 'node:stream/iter';

const readable = Readable.fromStreamIter(from('hello'));
console.log(await text(from(readable)));
```

```cjs
const { Readable } = require('node:stream');
const { from, text } = require('node:stream/iter');

async function run() {
  const readable = Readable.fromStreamIter(from('hello'));
  console.log(await text(from(readable)));
}

run().catch(console.error);
```
````

Note: The CJS variant must wrap top-level `await` in an async function.
The ESM variant can use top-level `await` directly.

### ESLint rules apply to code blocks

JavaScript code blocks inside markdown files are linted by ESLint via
`make lint-md` (which runs `make lint-js-doc` internally). Key rules
that frequently cause failures:

| Rule                  | What it enforces                                   | Common fix                                      |
| --------------------- | -------------------------------------------------- | ----------------------------------------------- |
| `no-restricted-globals` | Cannot use bare `process` global                     | Import `process` or use a different example       |
| `capitalized-comments`  | Comments must start with an uppercase letter       | `// Foo` not `// foo`                               |
| `func-style`            | Use function declarations, not `const fn = function` | `function gen() {}` not `const gen = function() {}` |
| `no-void`               | Don't use the `void` operator                        | Use `// eslint-disable-next-line no-unused-vars`  |
| `no-unused-vars`        | Variables must be used                             | Remove or use the variable                      |

### Using eslint-disable comments in examples

When a lint rule conflict is unavoidable in an example:

```javascript
// eslint-disable-next-line no-unused-vars
for await (const chunk of readable) {
  // Consume until done
}
```

## Non-ASCII Characters

The `node-core/non-ascii-character` ESLint rule rejects non-ASCII characters
in JavaScript files under `lib/`. This applies to both code and comments.

| Wrong | Correct | Character name |
| ----- | ------- | -------------- |
| `—`     | `-`       | Em dash        |
| `–`     | `-`       | En dash        |
| `'` `'`   | `'`       | Smart quotes   |
| `"` `"`   | `"`       | Smart quotes   |
| `…`     | `...`     | Ellipsis       |

This rule does NOT apply to markdown files — only to `.js` and `.mjs` files.
However, code comments in `lib/internal/` should always use ASCII.

## Lint and Format Commands

| Command        | What it does                                               |
| -------------- | ---------------------------------------------------------- |
| `make lint-md`   | Checks markdown structure + JS code blocks + link ordering |
| `make format-md` | Auto-formats markdown (line wrapping, spacing)             |
| `make lint-js`   | Checks JS files including `errors.js` ordering               |
| `make lint`      | Runs all linters (JS, C++, markdown, YAML)                 |

**Recommended workflow for doc changes:**

```bash
# 1. Make doc changes
$EDITOR doc/api/stream.md

# 2. Run markdown lint
make lint-md

# 3. Fix any ordering/formatting issues

# 4. If you also changed errors.js, run JS lint too
make lint-js
```

## Checklist for Documentation Changes

| Step | Action                                                                  |
| ---- | ----------------------------------------------------------------------- |
| 1    | New doc file? Add to `doc/api/index.md` (alphabetical order)              |
| 2    | YAML metadata block with `added: REPLACEME`                               |
| 3    | Stability indicator for experimental APIs                               |
| 4    | Both `mjs` and `cjs` code examples                                          |
| 5    | Link reference definitions in correct ASCII sort order                  |
| 6    | New error code? Add to both `errors.js` and `errors.md` (both alphabetized) |
| 7    | Methods listed alphabetically within the doc file                       |
| 8    | Run `make lint-md` to verify                                              |
| 9    | Run `make lint-js` if `errors.js` was changed                               |
