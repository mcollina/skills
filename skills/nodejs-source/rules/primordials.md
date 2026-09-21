---
name: primordials
description: Using primordials in Node.js internal modules to prevent prototype pollution
metadata:
  tags: primordials, prototype-pollution, internals, safety, contributing
---

# Primordials

Primordials are frozen copies of JavaScript built-in objects captured before
any user code runs. They protect Node.js internal modules from prototype
pollution — user code that mutates `Array.prototype`, `RegExp.prototype`,
`Promise.prototype`, etc. cannot affect internal behavior.

## Who can use primordials

Primordials are **only available to internal modules** in `lib/internal/`.
User code has no access to the `primordials` object. They are purely an
internal mechanism for hardening Node.js core.

## When in doubt, use primordials

For all new code in `lib/internal/`, **use primordials by default**. There
are specific exceptions for performance (documented below), but the default
should always be to use them. The ESLint rule `node-core/prefer-primordials`
enforces this.

## How they work

The file `lib/internal/per_context/primordials.js` runs during the V8
snapshot build (`node_mksnapshot`). It captures pristine copies of all
JavaScript built-in constructors, static methods, and prototype methods onto
a frozen, null-prototype `primordials` object.

The key transformation is `uncurryThis`: prototype methods are converted from
`obj.method(args)` into standalone functions where `this` becomes the first
argument:

```javascript
// Instead of:
arr.push(item);                      // Calls user-mutable Array.prototype.push

// Use:
const { ArrayPrototypePush } = primordials;
ArrayPrototypePush(arr, item);       // Calls the saved original
```

The entire `primordials` object is serialized into the V8 heap snapshot that
ships with the Node.js binary. At runtime, Node.js deserializes this snapshot
rather than re-running the capture.

## Not all built-ins are available as primordials

Primordials capture what exists on the global objects when `primordials.js`
runs during snapshot creation. **Some V8 built-ins are not yet initialized at
that point, even if they are available at normal runtime.**

`Error.isError` is a known example: it is a shipping V8 feature but is not
present when the snapshot captures primordials. Attempting to use it as
`ErrorIsError` from primordials will fail.

**Do not assume a built-in can be used as a primordial.** Verify it exists in
`typings/primordials.d.ts` or test empirically. If a built-in is not
available as a primordial, use direct access with an eslint-disable comment:

```javascript
// eslint-disable-next-line node-core/prefer-primordials
const result = Error.isError(value);
```

Or, use a safe alternative if one exists (e.g. `isError` in
`require('internal/util')`).

## The import pattern

Destructure from `primordials` at the top of the file, immediately after
`'use strict'`. Properties must be in **ASCIIbetical order** (capitals before
lowercase). This is enforced by the `node-core/alphabetize-primordials` lint
rule.

```javascript
'use strict';

const {
  ArrayIsArray,
  ArrayPrototypeJoin,
  ArrayPrototypePush,
  ObjectDefineProperty,
  ObjectKeys,
  SafeSet,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
  TypeError,
} = primordials;
```

The destructuring must be **multiline** and must be the **first expression**
after `'use strict'`.

## What's available

### Constructors and globals

Direct references to built-in constructors, safe from `globalThis` mutation:

```javascript
const { Array, Error, TypeError, Promise, RegExp, String } = primordials;
```

### Static methods

Named as `ConstructorMethod`:

```javascript
const {
  ArrayIsArray,          // Array.isArray
  ArrayFrom,             // Array.from
  ObjectKeys,            // Object.keys
  ObjectDefineProperty,  // Object.defineProperty
  NumberIsFinite,        // Number.isFinite
  ErrorCaptureStackTrace, // Error.captureStackTrace
  JSONStringify,         // JSON.stringify
  MathMax,               // Math.max
} = primordials;
```

### Prototype methods (via `uncurryThis`)

Named as `ConstructorPrototypeMethod`. The `this` argument becomes the first
parameter:

```javascript
const {
  ArrayPrototypePush,       // arr.push(item)     → ArrayPrototypePush(arr, item)
  ArrayPrototypeSlice,      // arr.slice(0, 3)    → ArrayPrototypeSlice(arr, 0, 3)
  StringPrototypeSlice,     // str.slice(0, 5)    → StringPrototypeSlice(str, 0, 5)
  StringPrototypeStartsWith, // str.startsWith(p) → StringPrototypeStartsWith(str, p)
  RegExpPrototypeExec,      // re.exec(str)       → RegExpPrototypeExec(re, str)
} = primordials;
```

### `Apply` variants for variadic methods

For methods that accept variable arguments, use the `Apply` suffix to pass
an array of arguments:

```javascript
const {
  ArrayPrototypePushApply,  // arr.push(...items) → ArrayPrototypePushApply(arr, items)
  MathMaxApply,             // Math.max(...nums)  → MathMaxApply(nums)
} = primordials;
```

### Safe classes

Safe versions of iterable collections whose prototype chains are frozen and
set to null. User mutations to `Map.prototype`, `Set.prototype`, etc. cannot
affect them:

```javascript
const {
  SafeMap,
  SafeSet,
  SafeWeakMap,
  SafeWeakSet,
  SafeWeakRef,
  SafeFinalizationRegistry,
  SafeArrayIterator,
  SafeStringIterator,
} = primordials;
```

### Safe Promise utilities

Promise combinators with varying levels of safety:

```javascript
const {
  PromisePrototypeThen,             // Safe .then() call
  SafePromiseAll,                   // Wraps each promise, but result array is mutable
  SafePromiseAllReturnVoid,         // Fully safe — no result array
  SafePromiseAllReturnArrayLike,    // Fully safe — returns null-prototype array-like
  SafePromiseAllSettled,
  SafePromiseAllSettledReturnVoid,
  SafePromiseAny,
  SafePromiseRace,
  SafePromisePrototypeFinally,
} = primordials;
```

## When NOT to use primordials

### Performance carve-outs

These subsystems **ban prototype primordials** entirely (ESLint enforced):

- `node:http` (`lib/_http_*.js`, `lib/http.js`, `lib/internal/http.js`)
- `node:http2` (`lib/http2.js`, `lib/internal/http2/*.js`)
- `node:tls` (`lib/_tls_*.js`, `lib/tls.js`)
- `node:zlib` (`lib/zlib.js`)

In these files, constructor primordials (`Array`, `Object`) are still used
but prototype primordials (`ArrayPrototypePush`) are forbidden.

### Known-slow primordials

These have measured performance impact. Benchmark before using them in hot
code paths:

- **Array mutation**: `ArrayPrototypePush`, `ArrayPrototypePop`,
  `ArrayPrototypeShift`, `ArrayPrototypeUnshift`
- **Function binding**: `FunctionPrototypeBind`, `FunctionPrototypeCall`
  (especially for super constructor calls)
- **Safe iterators**: `SafeArrayIterator`, `SafeStringIterator`
- **Safe promises**: `SafePromiseAll`, `SafePromiseAllSettled`,
  `SafePromiseAny`, `SafePromiseRace`, `SafePromisePrototypeFinally`
  (use `try {} finally {}` instead of the last one)
- **Reflect**: `ReflectConstruct` (creates new hidden classes inside
  functions — consider a shared class instead)
- **No-op function**: Use `() => {}` instead of `FunctionPrototype`

### Bootstrap code

Code that provably runs before any user code can execute does not strictly
need primordials. This is rare and must be explicitly justified with a
comment:

```javascript
// This is run before any user code, it's OK not to use primordials.
```

## Unsafe patterns and safe alternatives

### Array iteration

```javascript
// UNSAFE — calls user-mutable Symbol.iterator and .next():
for (const item of array) { ... }

// SAFE:
for (let i = 0; i < array.length; i++) { ... }
```

### Array destructuring

```javascript
// UNSAFE — calls Symbol.iterator:
const [first, second] = array;

// SAFE — object destructuring uses property access, not iteration:
const { 0: first, 1: second } = array;
```

The ESLint rule `node-core/no-array-destructuring` enforces this.

### Spread operator

```javascript
// UNSAFE:
const copy = [...array];
func(...array);

// SAFE:
const copy = ArrayPrototypeSlice(array);
ReflectApply(func, null, array);

// SAFE — when spread is unavoidable (e.g., variadic call):
func(...new SafeArrayIterator(array));
```

### RegExp — `test` is unsafe

`RegExpPrototypeTest` calls `.exec` on the prototype chain, which is
user-mutable. Use `RegExpPrototypeExec` directly:

```javascript
// UNSAFE — calls user-mutable .exec internally:
RegExpPrototypeTest(pattern, string)

// SAFE:
RegExpPrototypeExec(pattern, string) !== null
```

### String methods with RegExp

`String.prototype.match/replace/search/split` look up Symbol methods on the
regex argument. These are all user-mutable:

| String method              | Looks up           | Safe alternative                            |
| -------------------------- | ------------------ | ------------------------------------------- |
| `StringPrototypeMatch`     | `Symbol.match`     | `RegExpPrototypeExec`                       |
| `StringPrototypeReplace`   | `Symbol.replace`   | `RegExpPrototypeSymbolReplace(re, str, rep)` |
| `StringPrototypeSearch`    | `Symbol.search`    | `SafeStringPrototypeSearch(str, re)`        |
| `StringPrototypeSplit`     | `Symbol.split`     | `RegExpPrototypeSymbolSplit(re, str)`       |

For full regex safety (protecting against flag getter mutation too), use
`hardenRegExp(re)` which copies all methods and flag getters directly onto
the instance.

### Promise combinators — three layers of unsafety

```javascript
PromiseAll([...])                           // UNSAFE: iteration + .then lookup + result
PromiseAll(new SafeArrayIterator([...]))    // UNSAFE: .then lookup + result
SafePromiseAll([...])                       // UNSAFE: result array prototype
SafePromiseAllReturnVoid([...])             // SAFE
SafePromiseAllReturnArrayLike([...])        // SAFE
```

Use `SafePromiseAllReturnVoid` when you only need to wait, or
`SafePromiseAllReturnArrayLike` when you need results. Only use
`SafePromiseAll` when the result is returned to user code (they expect a
real Array).

These accept a mapper function as a second argument, which is more efficient
than a separate `ArrayPrototypeMap`:

```javascript
// Less efficient:
SafePromiseAll(ArrayPrototypeMap(array, someFunction));

// More efficient:
SafePromiseAll(array, someFunction);
```

### `instanceof`

```javascript
// UNSAFE — looks up Symbol.hasInstance:
value instanceof SomeClass

// SAFE:
FunctionPrototypeSymbolHasInstance(SomeClass, value)
```

### Object property descriptors

Always use null-prototype objects for property descriptors and Proxy
handlers. Without `__proto__: null`, a user-defined `Object.prototype.get`
can corrupt descriptors:

```javascript
// UNSAFE:
ObjectDefineProperty(obj, 'prop', { value: 0 });

// SAFE:
ObjectDefineProperty(obj, 'prop', { __proto__: null, value: 0 });
```

### Array concatenation

`ArrayPrototypeConcat` looks up `Symbol.isConcatSpreadable`. Use push
instead:

```javascript
// UNSAFE:
const result = ArrayPrototypeConcat(a, b);

// SAFE:
ArrayPrototypePushApply(a, b);  // Mutates a

// SAFE (new array):
const result = ArrayPrototypeSlice(a);
ArrayPrototypePushApply(result, b);
```

### Collection constructors with arrays

`new SafeSet([array])` still iterates the array via `Symbol.iterator`. Use
`.add()` instead:

```javascript
// UNSAFE:
const set = new SafeSet([1, 2, 3]);

// SAFE:
const set = new SafeSet();
set.add(1).add(2).add(3);
```

### Generators and async generators

Avoid generators in core code. Their `.next()` method lives on a
user-mutable prototype (`%GeneratorFunction.prototype.prototype%`). There is
no safe wrapper.

### String iteration

For iterating Unicode strings (where indexed access breaks on multi-code-unit
characters), use `SafeStringIterator`:

```javascript
for (const char of new SafeStringIterator(str)) { ... }
```

For ASCII-safe strings, indexed `for` loops are fine and faster.

## ESLint rules

| Rule                                    | Enforces                                              |
| --------------------------------------- | ----------------------------------------------------- |
| `node-core/prefer-primordials`          | Flags direct use of globals that should be primordials |
| `node-core/alphabetize-primordials`     | Import ordering: ASCIIbetical, multiline, first expr  |
| `node-core/no-array-destructuring`      | Flags `[a, b] = arr` (use object destructuring)       |
| `node-core/avoid-prototype-pollution`   | Flags unsafe descriptor/handler patterns              |

## References

- Official contributing guide: `doc/contributing/primordials.md` (detailed
  examples for every pattern above)
- Source: `lib/internal/per_context/primordials.js`
- TypeScript typings: `typings/primordials.d.ts`
- ESLint rules: `tools/eslint-rules/prefer-primordials.js`,
  `tools/eslint-rules/alphabetize-primordials.js`
