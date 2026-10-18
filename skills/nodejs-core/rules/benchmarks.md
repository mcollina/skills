---
name: benchmarks
description: Running benchmark/compare.js, reading the statistics, writing a new benchmark, and the evidence bar for performance claims in nodejs/node
metadata:
  tags: benchmarks, performance, compare.js, statistics, review
---

# Benchmarks and Performance Claims

A performance claim without numbers does not survive review. Neither does a
micro-optimization whose only justification is that it looks faster — reviewers
weigh every clever rewrite against the maintenance cost it imposes, and the
burden of proof is on the author.

The standard, stated plainly by a TSC member on a PR of exactly this kind:

> I'd prefer not to micro-optimize these things if the benefit is only
> marginal. The more we micro-optimize this stuff the more difficult
> maintenance becomes.

So: measure first, put the numbers in the PR description, and be ready to
abandon a change whose measured win is inside the noise.

## Comparing two builds

`benchmark/compare.js` runs a benchmark category against two binaries and
reports whether the difference is real.

```bash
# Build the "new" binary from your branch, keep a "main" build around.
node benchmark/compare.js \
  --old ./node-main \
  --new ./node-branch \
  --runs 30 \
  --filter buffer-compare-offset \
  --analyze \
  buffers
```

Key flags:

| Flag | Meaning |
| --- | --- |
| `--old`, `--new` | The two binaries (both required). |
| `--runs` | Samples per configuration. 30 is the default; raise it for noisy results. |
| `--filter <pattern>` | Only benchmark scripts matching the pattern (repeatable). |
| `--exclude <pattern>` | Skip matching scripts (repeatable). |
| `--set var=value` | Pin a benchmark configuration variable (repeatable). |
| `--analyze` | Run the statistics directly (Welch's t-test plus effect size) instead of emitting CSV. |
| `--csv <file>` | Write the raw samples to a file; combine with `--analyze` to get both. |
| `--no-progress` | Suppress the progress indicator. |

`--analyze` is the modern path and needs no extra tooling. The older route —
piping CSV into `Rscript benchmark/compare.R` — still works if you have R
installed.

## Reading the output

The table reports, per configuration, the percentage change, a confidence
marker, and the p-value. Read it honestly:

* **Confidence markers** (`*`, `**`, `***`) indicate statistical significance,
  not importance. A statistically significant 0.4% change is still noise as far
  as a maintainability trade-off is concerned.
* **No marker means no result.** Do not report an unmarked difference as an
  improvement.
* Run on a quiet machine. A laptop doing anything else produces numbers that
  will not reproduce for your reviewer.
* Raise `--runs` rather than re-running until you get the answer you want.

Quote the actual table in the PR description, including the configurations that
did not improve. Reviewers will ask for the regressions you left out.

## Writing a benchmark

Benchmarks live in `benchmark/<category>/<name>.js`:

```js
'use strict';
const common = require('../common.js');

const bench = common.createBenchmark(main, {
  method: ['offset', 'slice'],
  size: [16, 512, 4096, 16386],
  n: [1e6],
});

function main({ n, size, method }) {
  const fn = method === 'slice' ? compareUsingSlice : compareUsingOffset;
  bench.start();
  fn(Buffer.alloc(size, 'a'), Buffer.alloc(size, 'b'), size >> 1, n);
  bench.end(n);
}
```

* `createBenchmark(main, configs[, options])` — the config object is a matrix;
  every combination is run.
* Everything that is not the measured work goes **before** `bench.start()`.
* `bench.end(n)` takes the iteration count so the harness can report per-op
  numbers.
* Add a smoke test under `test/benchmark/` so CI catches a benchmark that stops
  running at all. These tests use `--runs 1` and tiny sizes — they verify the
  benchmark executes, not its performance.

## When a benchmark is expected

* Any PR whose stated purpose is performance.
* Changes to a documented hot path — `Buffer`, streams, HTTP parsing, `fs`,
  `url`, `path`, string handling in `lib/internal`.
* Replacing a straightforward implementation with a harder-to-read one.
* Adding a fast path or a V8 fast API call.

If a change is a readability or correctness fix that happens to touch a hot
path, say so and show that performance did not regress.

## Review checklist

* [ ] Numbers in the PR description, from `compare.js --analyze`, including
      configurations that did not improve.
* [ ] `--runs` high enough that the result is stable across repeats.
* [ ] The measured win justifies the added complexity — and if it does not, the
      change is withdrawn.
* [ ] New benchmark has a `test/benchmark/` smoke test.
* [ ] Setup work is outside `bench.start()` / `bench.end()`.

## References

* [doc/contributing/writing-and-running-benchmarks.md](https://github.com/nodejs/node/blob/HEAD/doc/contributing/writing-and-running-benchmarks.md)
* [profiling-v8.md](profiling-v8.md) — finding the hot path before optimizing it
* [v8-jit-compilation.md](v8-jit-compilation.md) — deoptimization as a cause of regressions
* [semver-and-stability.md](semver-and-stability.md) — when an optimization changes observable behavior
