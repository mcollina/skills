---
name: profiling-v8
description: --prof, --trace-opt, --trace-deopt, flame graphs for V8
metadata:
  tags: profiling, v8, performance, flame-graphs, cpu-profiling
---

# V8 Profiling

V8 provides extensive profiling capabilities for understanding JavaScript performance. This guide covers CPU profiling, optimization tracing, and flame graph generation.

## CPU Profiling with --prof

### Generating Profile

```bash
# Run with profiler
node --prof app.js

# Generates isolate-*.log file
# File contains tick samples and code events
```

### Processing Profile

```bash
# Process the log file
node --prof-process isolate-0x*.log > processed.txt

# Or with specific format
node --prof-process --preprocess isolate-*.log > profile.v8log.json
```

### Reading Profile Output

```
Statistical profiling result from isolate-0x1234.log

 [Shared libraries]:
   ticks  total  nonlib   name
     15    0.3%    0.0%  /usr/lib/libc.so.6

 [JavaScript]:
   ticks  total  nonlib   name
    523   10.5%   10.8%  LazyCompile: *processData app.js:42
    312    6.3%    6.4%  LazyCompile: *hashFunction app.js:78
    201    4.0%    4.1%  Builtin: StringCharCodeAt

 [C++]:
   ticks  total  nonlib   name
    234    4.7%    4.8%  v8::internal::Invoke
     89    1.8%    1.8%  node::Buffer::New

 [Bottom up (heavy) profile]:
   ticks parent  name
    523   10.5%  LazyCompile: *processData app.js:42
    312   59.7%    LazyCompile: *handleRequest app.js:15
    211   40.3%    LazyCompile: *processChunk app.js:90
```

Key indicators:
- `*` before function name = optimized
- `~` before function name = interpreted (not optimized)
- High ticks in C++ = possible native bottleneck
- High ticks in GC = memory pressure

## Optimization Tracing

### --trace-opt

```bash
# Trace function optimization
node --trace-opt app.js 2>&1 | grep -E "optimiz|Compiling"

# Output:
# [marking 0x1234 <SharedFunctionInfo add> for optimized recompilation]
# [compiling method 0x1234 <SharedFunctionInfo add> using TurboFan]
# [completed optimizing 0x1234 <SharedFunctionInfo add>]
```

### --trace-deopt

```bash
# Trace deoptimization
node --trace-deopt app.js 2>&1 | tee deopt.log

# Output:
# [deoptimizing (DEOPT eager): begin 0x1234 <SharedFunctionInfo add>]
# [deoptimizing (DEOPT eager): end 0x1234 <SharedFunctionInfo add> @2]
#   reason: not a Smi
#   stack: add at app.js:42
```

Common deoptimization reasons:
| Reason | Meaning |
|--------|---------|
| `not a Smi` | Expected small integer, got something else |
| `wrong map` | Object shape changed |
| `minus zero` | Result was -0 |
| `out of bounds` | Array access beyond length |
| `not a heap number` | Expected heap-allocated number |

### --trace-opt-verbose

```bash
# Very detailed optimization info
node --trace-opt-verbose app.js 2>&1 > opt-verbose.log
```

## Flame Graphs

### Using 0x

```bash
# Install 0x
npm install -g 0x

# Generate flame graph
0x app.js

# Opens in browser automatically
# Or specify output
0x -o flamegraph.html app.js
```

### Using perf (Linux)

```bash
# Record
perf record -F 99 -g -- node app.js

# Generate flame graph
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
```

### Using dtrace (macOS)

```bash
# Record
sudo dtrace -x ustackframes=100 -n 'profile-97 /pid == $target/ {
  @[ustack()] = count();
}' -p $(pgrep node) -o out.stacks

# Convert
stackcollapse.pl out.stacks | flamegraph.pl > flame.svg
```

### Reading Flame Graphs

```
Width = Time spent in function
Height = Stack depth
Color = Usually random (or can indicate optimization state)

Look for:
- Wide boxes at top = Direct CPU consumers
- Wide plateaus = Functions calling slow children
- Narrow spikes = Normal call patterns
```

## V8 Inspector Profiler

### Programmatic Profiling

```javascript
const v8 = require('node:v8');
const inspector = require('node:inspector');

const session = new inspector.Session();
session.connect();

// Start profiling
session.post('Profiler.enable');
session.post('Profiler.start');

// Run your code...
runHeavyOperation();

// Stop and get profile
session.post('Profiler.stop', (err, { profile }) => {
  const fs = require('fs');
  fs.writeFileSync('profile.cpuprofile', JSON.stringify(profile));
  // Open in Chrome DevTools
});
```

### Chrome DevTools

```bash
# Start with inspector
node --inspect app.js

# Or break on start
node --inspect-brk app.js

# Open Chrome: chrome://inspect
# Go to Performance tab
# Record CPU profile
```

## Tick Processor Options

```bash
# All options
node --prof-process --help

# Common options:
node --prof-process --js       # JavaScript only
node --prof-process --gc       # Include GC
node --prof-process --ic       # Include IC info
node --prof-process --range=1000:2000  # Time range

# Output format
node --prof-process --preprocess  # JSON format
node --prof-process --ll-prof     # Linux perf format
```

## Memory Profiling

### Heap Snapshots

```javascript
const v8 = require('node:v8');
const fs = require('node:fs');

// Take snapshot
const filename = v8.writeHeapSnapshot();
console.log(`Heap snapshot written to ${filename}`);

// Or stream it
const stream = fs.createWriteStream('heap.heapsnapshot');
v8.writeHeapSnapshot('heap.heapsnapshot');
```

### Heap Statistics

```javascript
const v8 = require('node:v8');

setInterval(() => {
  const stats = v8.getHeapStatistics();
  console.log({
    total: (stats.total_heap_size / 1024 / 1024).toFixed(2) + ' MB',
    used: (stats.used_heap_size / 1024 / 1024).toFixed(2) + ' MB',
    external: (stats.external_memory / 1024 / 1024).toFixed(2) + ' MB',
  });
}, 5000);
```

### Heap Space Details

```javascript
const v8 = require('node:v8');

const spaces = v8.getHeapSpaceStatistics();
for (const space of spaces) {
  console.log(`${space.space_name}:`);
  console.log(`  size: ${(space.space_size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  used: ${(space.space_used_size / 1024 / 1024).toFixed(2)} MB`);
}
```

## Advanced Profiling Flags

### Tracing Compilation

```bash
# Trace inlining decisions
node --trace-inlining app.js

# Trace bailouts
node --trace-bailout app.js

# Trace turbo inlining
node --trace-turbo-inlining app.js
```

### GC Tracing

```bash
# Trace GC events
node --trace-gc app.js

# Verbose GC tracing
node --trace-gc-verbose app.js

# Trace GC object stats
node --trace-gc-object-stats app.js

# Example output:
# [12345:0x...]   100 ms: Scavenge 4.2 (6.0) -> 3.8 (7.0) MB, 1.2 / 0.0 ms
# [12345:0x...]   500 ms: Mark-sweep 15.2 (20.0) -> 12.1 (20.0) MB, 50 ms
```

### IC (Inline Cache) Tracing

```bash
# Trace inline cache state changes
node --trace-ic app.js 2>&1 | head -100

# Look for megamorphic IC (poor optimization)
node --trace-ic app.js 2>&1 | grep megamorphic
```

## Benchmarking

### Node.js Benchmark Suite

```bash
# Clone node
git clone https://github.com/nodejs/node.git
cd node/benchmark

# Run specific benchmark
node fs/readfile.js

# Compare two versions
node compare.js --runs 30 --new ./node-new --old ./node-old fs
```

### Micro-Benchmarking

```javascript
const { performance, PerformanceObserver } = require('node:perf_hooks');

// Measure function
function benchmark(name, fn, iterations = 100000) {
  performance.mark('start');

  for (let i = 0; i < iterations; i++) {
    fn();
  }

  performance.mark('end');
  performance.measure(name, 'start', 'end');

  const [measure] = performance.getEntriesByName(name);
  console.log(`${name}: ${(measure.duration / iterations * 1000).toFixed(3)}µs per call`);
  performance.clearMarks();
  performance.clearMeasures();
}

// Warm up
for (let i = 0; i < 1000; i++) myFunction();

// Benchmark
benchmark('myFunction', myFunction);
```

### Using Benchmark.js

```javascript
const Benchmark = require('benchmark');

const suite = new Benchmark.Suite;

suite
  .add('RegExp#test', () => /o/.test('Hello World!'))
  .add('String#indexOf', () => 'Hello World!'.indexOf('o') > -1)
  .add('String#includes', () => 'Hello World!'.includes('o'))
  .on('cycle', (event) => console.log(String(event.target)))
  .on('complete', function() {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  .run({ async: true });
```

## Production Profiling

### Clinic.js

```bash
# Install
npm install -g clinic

# Doctor (overview)
clinic doctor -- node app.js

# Flame (CPU profiling)
clinic flame -- node app.js

# Bubbleprof (async profiling)
clinic bubbleprof -- node app.js
```

### Continuous Profiling

```javascript
// Sample-based profiling for production
const v8 = require('node:v8');

class ContinuousProfiler {
  constructor(intervalMs = 60000) {
    this.intervalMs = intervalMs;
    this.profiles = [];
  }

  start() {
    this.timer = setInterval(() => {
      this.takeProfile();
    }, this.intervalMs);
  }

  takeProfile() {
    const session = new inspector.Session();
    session.connect();

    session.post('Profiler.enable');
    session.post('Profiler.start');

    setTimeout(() => {
      session.post('Profiler.stop', (err, { profile }) => {
        this.profiles.push({
          timestamp: Date.now(),
          profile
        });
        session.disconnect();
      });
    }, 10000);  // Profile for 10 seconds
  }

  stop() {
    clearInterval(this.timer);
  }
}
```

## Common Performance Issues

### Deoptimization Loop

```javascript
// BAD: Function keeps getting deoptimized and reoptimized
function process(value) {
  return value.x + value.y;  // Different object shapes
}

// Called with different shapes
process({ x: 1, y: 2 });
process({ y: 2, x: 1 });  // Different property order!
process({ x: 1, y: 2, z: 3 });  // Extra property!
```

### Megamorphic Call Site

```javascript
// BAD: Many different object types
function getLength(obj) {
  return obj.length;
}

getLength([1, 2, 3]);
getLength("string");
getLength({ length: 5 });
getLength(new Uint8Array(10));
// IC becomes megamorphic - no caching
```

## References

- V8 blog: https://v8.dev/blog
- V8 profiler: https://v8.dev/docs/profile
- Node.js profiling guide: https://nodejs.org/en/docs/guides/simple-profiling
- 0x: https://github.com/davidmarkclements/0x
