---
name: semver-and-stability
description: Deciding whether a change is semver-major, the stability index lifecycle, deprecation process, web-standard API constraints, and backporting
metadata:
  tags: semver, semver-major, stability, experimental, deprecation, backporting, web-standards, review
---

# Semver, Stability, and Deprecation

The most expensive review mistake in `nodejs/node` is mislabeling a change.
A semver-major landed as semver-patch ships a break to users on an LTS line; a
change labeled major that did not need to be blocks for a release cycle. TSC
reviewers spend a great deal of their time on exactly this judgement, so make it
yourself before opening the PR and state your reasoning in the description.

Backward-incompatible changes to `main` need **approval from at least two TSC
voting members**.

## Is this semver-major?

The collaborator guide lists the categories:

* Removal or redefinition of existing API arguments.
* Changing return values.
* Removing or modifying existing properties on an options argument.
* Adding or removing errors.
* Altering expected timing of an event.
* Changing the side effects of using a particular API.

Those are broader than they look. Detectors that come up repeatedly in review,
each of which has caught a real PR:

**Property shape changed.** Moving a value from an own data property to a
prototype accessor is observable — through `Object.keys()`,
`hasOwnProperty()`, `JSON.stringify()`, spread, and property enumeration order.
A refactor of `IncomingMessage.rawHeaders` into a lazily-materialized accessor
is semver-major even though every read returns the same thing.

**Microtask timing changed.** Removing a `.then()` hop so a callback runs one
turn earlier changes observable ordering. In `ReadableStream`, the spec defines
`pull` as a promise-returning algorithm and therefore separates consecutive
pulls by a microtask; eliding that continuation when the result is not a
thenable is a breaking change, not an optimization.

**Validation tightened.** Rejecting an input that was previously accepted —
`-0`, a mixed-case encoding name, an out-of-range number — breaks code that
relied on it. "It was never documented" is not a defense on a stable API.

**Error identity changed.** Adding or removing an error a public API throws,
or changing an existing `code`, is breaking. Changing the *message* of an error
that has a `code` is not.

**Ecosystem impact from internal changes.** Breaking internal elements is
allowed in semver-patch/minor, but if the change will break real packages it is
semver-major regardless of where the code lives. Use
[CITGM](https://github.com/nodejs/citgm) to find out rather than guessing.

When unsure, write the smallest possible test that a user could have written
against the old behavior and see whether it still passes. If it does not, it is
semver-major.

**Split the PR.** If a behavior-preserving refactor and a breaking change are
tangled together, reviewers will ask you to separate them so the safe half can
land now and the breaking half can be labeled and scheduled. Doing that up
front saves a round trip.

## Deprecation

A stable public API that changes incompatibly must go through deprecation
first. Exceptions — no deprecation cycle required — are:

* Adding or removing errors thrown or reported by a public API.
* Emitting a runtime warning.
* Changing error messages for errors without an error code.
* Altering timing and non-internal side effects.
* Changes to errors thrown by dependencies such as V8.
* A one-time exception granted by the TSC.

The stages, each recorded in `doc/api/deprecations.md` with a `DEP####` code:

1. **Documentation-only** — the docs mark it deprecated. Semver-minor.
2. **Runtime** — a process warning on use, via `process.emitWarning()` or
   `util.deprecate()`. Usually semver-major.
3. **End-of-life** — removed. Semver-major.

Allocate the next free `DEP####` in `doc/api/deprecations.md` and add the
`deprecated:` YAML metadata to the API's entry in `doc/api/*.md`. See
[documentation.md](documentation.md).

Experimental and undocumented APIs are normally removed without a deprecation
cycle — unless they have picked up non-trivial ecosystem adoption, in which
case they get one anyway.

## Stability index

| Index | Meaning |
| --- | --- |
| 0 – Deprecated | Discouraged; warnings may be emitted. |
| 1.0 – Early development | Rough, likely to change. |
| 1.1 – Active development | Taking shape; still may change. |
| 1.2 – Release candidate | Close to stable; change is unlikely. |
| 2 – Stable | Compatibility is a priority. |
| 3 – Legacy | Works, but no longer recommended. |

New features land Experimental (stability 1) behind a flag where practical —
see [cli-options.md](cli-options.md) for the gating mechanics.

**New core modules** carry extra requirements:

* At least one week for review.
* Sign-off from **at least two TSC voting members**.
* Land with a Stability Index of Experimental, and stay Experimental until a
  semver-major release.
* The author takes ownership of the experiment: promote it to stable or remove
  it in a timely manner, and help assess and patch security issues in it.

Introducing an experimental feature is a commitment, not a way to dodge review.

## Web-standard APIs

Node.js implements a growing number of WHATWG and W3C APIs. Reviewers hold them
to the specification, not to Node.js convention.

* **Do not add non-standard methods to a standard interface.** When a standard
  object needs Node.js-specific behavior, use an existing protocol instead —
  for example `process.ref()` / `process.unref()` rather than putting
  `ref()`/`unref()` on the object itself.
* Divergence from the spec must be deliberate and documented as such in
  `doc/api/*.md`.
* **Living standards are not bound by our semver.** A WHATWG spec change can
  require a behavior change in a minor release; that is expected, and it is not
  a reason to skip the analysis of who it breaks.
* Verify against [WPT](https://github.com/web-platform-tests/wpt) where
  coverage exists rather than writing a bespoke test.

## Backporting

| Change | Backport? |
| --- | --- |
| Security fix | Always |
| Bug fix | If it applies cleanly and is low risk |
| Semver-minor feature | Only after it has baked on `main`, per release policy |
| Semver-major | Never |

Mechanics:

* Label the PR `dont-land-on-v20.x` (and so on) when a change must not be
  backported to a given line.
* A backport PR targets the staging branch (`v20.x-staging`), not `v20.x`.
* Cherry-pick with `-x`, and add a `Backport-PR-URL:` trailer — this is the one
  case where you write a URL trailer yourself; `PR-URL:` and `Reviewed-By:`
  still come from the landing tooling. See
  [commit-and-pr-guideline.md](commit-and-pr-guideline.md).

ABI-breaking changes are strongly discouraged once a line is in LTS; security
fixes are the usual exception.

## Review checklist

* [ ] Decided major/minor/patch and said why in the PR description.
* [ ] Checked the property-shape, timing, validation, and error-identity
      detectors above.
* [ ] Breaking change: two TSC voting-member approvals, deprecation cycle
      considered, CITGM run if the ecosystem could be affected.
* [ ] New API: stability index set, flag gating decided, documented.
* [ ] New core module: two TSC sign-offs, one week, Experimental.
* [ ] Standard API: no non-standard additions; spec cited for any divergence.
* [ ] Backport labels applied.

## References

* [collaborator-guide.md](https://github.com/nodejs/node/blob/HEAD/doc/contributing/collaborator-guide.md) — breaking changes, deprecations, new core modules
* [backporting-to-release-lines.md](https://github.com/nodejs/node/blob/HEAD/doc/contributing/backporting-to-release-lines.md)
* [doc/api/deprecations.md](https://github.com/nodejs/node/blob/HEAD/doc/api/deprecations.md)
* [doc/api/documentation.md#stability-index](https://github.com/nodejs/node/blob/HEAD/doc/api/documentation.md#stability-index)
* [cli-options.md](cli-options.md) — flag gating for experimental features
* [documentation.md](documentation.md) — YAML metadata for `added:`, `deprecated:`, `changes:`
