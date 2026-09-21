---
name: nodejs-v8-perf
description: Investigates V8 performance in Node.js. Use when a function deoptimizes, when analysing --trace-opt or --trace-deopt output, when profiling CPU with --prof or flame graphs, when GC pauses or heap growth are the suspected bottleneck, or when reasoning about hidden classes and inline caches.
metadata:
  tags: v8, performance, deoptimization, turbofan, hidden-classes, inline-cache, garbage-collection, profiling, flame-graph, prof
---

## Workflow

Measure before theorising. The usual order:

```bash
node --trace-opt --trace-deopt script.js      # which functions deopt, and why
node --prof script.js && node --prof-process isolate-*.log > processed.txt
node --trace-ic script.js                     # hidden class / IC transitions
```

Checkpoints that prevent wasted work:

1. Confirm the same function deoptimizes **consistently across runs** before
   acting on it. One-off deopts during warmup are normal.
2. Read the deopt *reason* ("not a Smi", "wrong map"), not just the function
   name — the reason names the fix.
3. After the fix, re-run `--trace-opt` and confirm the function now stays
   optimized. A disappearing deopt log line is the only real evidence.

## Rules

- [rules/v8-jit-compilation.md](rules/v8-jit-compilation.md) — TurboFan, optimization and deoptimization patterns
- [rules/v8-hidden-classes.md](rules/v8-hidden-classes.md) — hidden classes, inline caching, property ordering
- [rules/v8-garbage-collection.md](rules/v8-garbage-collection.md) — Scavenger, Mark-Sweep, Mark-Compact, generational GC
- [rules/profiling-v8.md](rules/profiling-v8.md) — `--prof`, `--trace-opt`, `--trace-deopt`, flame graphs

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Leaks and crashes rather than slowness → **nodejs-native-debug**
- Event loop lag and thread pool saturation → **nodejs-runtime-internals**
- Handle scopes and external memory in addons → **nodejs-addons**
