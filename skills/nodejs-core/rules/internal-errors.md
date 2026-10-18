---
name: internal-errors
description: Throwing ERR_* errors from lib/internal/errors.js, validating arguments with internal/validators, and keeping CHECK out of user-reachable paths
metadata:
  tags: errors, error-codes, validators, validation, CHECK, contributing, review
---

# Internal Errors and Argument Validation

Every error Node.js throws from its own code carries a stable `code` property.
The `code` is the API contract; the message is not. Getting this wrong is a
recurring review finding, in both directions: throwing a bare `Error` from JS,
and aborting the process with a `CHECK` in C++ where a JS-level `throw` was
required.

Canonical source: [doc/contributing/using-internal-errors.md][].

## Never throw a bare error

```js
// Wrong — no code, so users cannot branch on it and it is undocumented.
throw new TypeError(`Expected string, received ${typeof input}`);

// Right:
const { ERR_INVALID_ARG_TYPE } = require('internal/errors').codes;
throw new ERR_INVALID_ARG_TYPE('input', 'string', input);
```

Look for an existing code before inventing one. `lib/internal/errors.js` already
defines several hundred, and reviewers will point at the one you missed.

## Adding a new code

Four things, all in the same PR:

1. **Define it** at the end of `lib/internal/errors.js` with `E()`:

   ```js
   E('ERR_EXAMPLE_CONSTANT', 'This is the error value', TypeError);
   E('ERR_EXAMPLE_FORMATTED', (a, b) => `${a} and ${b} conflict`, RangeError);
   ```

   Arguments are `(code, message, BaseClass)`. The message is either a string
   with `util.format()` tags (`%s`, `%d`) or a function returning a string.
   Passing extra base classes creates derived variants exposed as properties:

   ```js
   E('ERR_EXAMPLE', 'Error message', TypeError, RangeError);
   // new ERR_EXAMPLE()            -> a TypeError
   // new ERR_EXAMPLE.RangeError() -> a RangeError
   ```

2. **Use it**:

   ```js
   const { ERR_EXAMPLE_CONSTANT } = require('internal/errors').codes;
   throw new ERR_EXAMPLE_CONSTANT();
   ```

3. **Document it** in `doc/api/errors.md`. Entries are ordered; see
   [documentation.md](documentation.md) for the link-reference and ordering
   rules that cause most doc lint failures. If `make lint` does not pick up the
   new code, clear the markdown lint cache with `make lint-clean`.

4. **Test it** — assert the `code`, and assert the message formatting too when
   the message is built by a function rather than a constant string.

   ```js
   assert.throws(() => doTheThing(), { code: 'ERR_EXAMPLE_FORMATTED' });
   ```

## Use the shared validators

`lib/internal/validators.js` produces correctly-shaped errors. Do not hand-roll
a `typeof` check and a throw.

```js
const {
  validateString,
  validateNumber,
  validateInteger,
  validateBoolean,
  validateObject,
  validateFunction,
  validateArray,
  validateOneOf,
  validatePort,
  validateAbortSignal,
  validateEncoding,
  validateBuffer,
} = require('internal/validators');

function readThing(path, options = kEmptyObject) {
  validateString(path, 'path');
  validateObject(options, 'options');
  validateAbortSignal(options.signal, 'options.signal');
}
```

Validate **at the JS boundary, in documented argument order**. Reviewers check
that the first bad argument a user passes is the one named in the error.

The `name` you pass becomes part of the message and follows a convention:
a dotted name is rendered as a property (`"options.signal" property`), a plain
name as an argument (`"path" argument`), and a name ending in `argument` is
used verbatim (`first argument`).

## Choosing the right code

| Situation | Code |
| --- | --- |
| Wrong type | `ERR_INVALID_ARG_TYPE(name, expected, actual)` |
| Right type, unacceptable value | `ERR_INVALID_ARG_VALUE(name, value[, reason])` |
| Numeric value outside the allowed range | `ERR_OUT_OF_RANGE(name, range, actual)` |
| Required argument absent | `ERR_MISSING_ARGS(...names)` |
| Called in the wrong state | a subsystem-specific code, e.g. `ERR_STREAM_DESTROYED` |

`ERR_INVALID_ARG_TYPE` takes the **expected** type before the **actual** value.
Expected may be a string or an array of strings; primitive type names are
lowercase (`'string'`, `'number'`), class names keep their casing (`'Buffer'`,
`'AbortSignal'`), and `'object'` must be written `'Object'` — there is an
assertion enforcing exactly that.

## `CHECK` must not be reachable from user input

In C++, `CHECK()` and its variants abort the process. They are for internal
invariants only. If a user can reach one by passing an unusual argument, you
have converted a catchable `TypeError` into a hard crash — and this is one of
the most consistent things TSC reviewers catch in `src/`.

Real examples from review:

* `perf_hooks.importHistogram()` aborting the process on a malformed
  `Uint8Array` instead of throwing, because the C++ constructor `CHECK`ed the
  decoded options.
* `Buffer.poolSize = 2 ** 53 + 2 ** 31; Buffer.allocUnsafe(1 << 20)` turning a
  JS `RangeError` into an abort after a `CHECK` was added to the allocation
  path.

The rule:

```text
User-supplied value  ->  validate in JS, throw an ERR_* code
Internal invariant   ->  CHECK in C++
```

When the validation genuinely has to happen in C++, throw rather than check:

```cpp
// Aborts — wrong for anything a user controls:
CHECK(args[0]->IsUint8Array());

// Throws a catchable JS error:
if (!args[0]->IsUint8Array()) {
  return THROW_ERR_INVALID_ARG_TYPE(env, "buffer must be a Uint8Array");
}
```

Before adding a `CHECK` in a path that touches arguments, ask: can a user get
here? If yes, it is a `THROW_ERR_*` or a JS-side validator.

## Review checklist

* [ ] No bare `Error`/`TypeError`/`RangeError` thrown from `lib/`.
* [ ] Reused an existing code where one fits.
* [ ] New codes: defined in `errors.js`, documented in `doc/api/errors.md`,
      covered by a test.
* [ ] Validation uses `internal/validators` helpers, in argument order.
* [ ] Tests assert `{ code: 'ERR_...' }`, not a message string.
* [ ] No new `CHECK` on a value a user can influence.
* [ ] Changing an existing error's `code` is a breaking change — see
      [semver-and-stability.md](semver-and-stability.md).

## References

* [doc/contributing/using-internal-errors.md][]
* [doc/api/errors.md](https://github.com/nodejs/node/blob/HEAD/doc/api/errors.md)
* [writing-tests.md](writing-tests.md) — asserting on codes
* [documentation.md](documentation.md) — ordering rules in `errors.md`

[doc/contributing/using-internal-errors.md]: https://github.com/nodejs/node/blob/HEAD/doc/contributing/using-internal-errors.md
