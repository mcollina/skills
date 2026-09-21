---
name: memory-debugging
description: Heap snapshots, memory leak detection, debugging memory issues
metadata:
  tags: memory, debugging, heap-snapshots, memory-leaks, v8
---

# Memory Debugging

Memory issues in Node.js can manifest as leaks, excessive consumption, or crashes. This guide covers tools and techniques for diagnosing and fixing memory problems.

## Understanding Node.js Memory

### Memory Layout

```
Process Memory
├── V8 Heap (JavaScript objects)
│   ├── New Space (Young Generation)
│   ├── Old Space (Old Generation)
│   ├── Large Object Space
│   └── Code Space
├── V8 External Memory (Buffers, ArrayBuffers)
├── Native Memory (C++ allocations)
└── Stack Memory
```

### Memory Limits

```bash
# Default old space limit (approximately)
# ~1.4GB on 64-bit systems

# Increase limit
node --max-old-space-size=4096 app.js  # 4GB

# Check current limits
node -e "console.log(v8.getHeapStatistics())"
```

## Heap Snapshots

### Taking Snapshots

```javascript
const v8 = require('node:v8');
const fs = require('node:fs');

// Method 1: Write to file
function takeSnapshot(filename) {
  const snapshotFile = filename || `heap-${Date.now()}.heapsnapshot`;
  v8.writeHeapSnapshot(snapshotFile);
  console.log(`Heap snapshot written to ${snapshotFile}`);
  return snapshotFile;
}

// Method 2: Using inspector
const inspector = require('node:inspector');

async function takeSnapshotWithInspector() {
  const session = new inspector.Session();
  session.connect();

  return new Promise((resolve, reject) => {
    const chunks = [];

    session.on('HeapProfiler.addHeapSnapshotChunk', (m) => {
      chunks.push(m.params.chunk);
    });

    session.post('HeapProfiler.takeHeapSnapshot', null, (err) => {
      session.disconnect();
      if (err) return reject(err);

      const snapshot = chunks.join('');
      fs.writeFileSync('heap.heapsnapshot', snapshot);
      resolve('heap.heapsnapshot');
    });
  });
}
```

### Comparing Snapshots

```javascript
// Take baseline
const snapshot1 = takeSnapshot('before.heapsnapshot');

// Run operation that may leak
await runPotentiallyLeakyOperation();

// Force GC if available
if (global.gc) {
  global.gc();
}

// Take comparison snapshot
const snapshot2 = takeSnapshot('after.heapsnapshot');

// Compare in Chrome DevTools:
// 1. Open DevTools -> Memory tab
// 2. Load both snapshots
// 3. Select "Comparison" view
// 4. Look for objects with positive delta
```

### Reading Heap Snapshots

Key terms:
- **Shallow Size**: Memory used by object itself
- **Retained Size**: Memory that would be freed if object is GC'd
- **Distance**: Shortest path from GC root
- **Retainers**: Objects holding references

Common patterns to look for:
```
High Retained Size + Low Shallow Size = Holding references to large objects
Growing Object Count = Likely leak
Many (string) or (array) = Possible unbounded collection
Detached DOM nodes = Event listener leaks (in browser-like environments)
```

## Memory Leak Detection

### Monitoring Memory Growth

```javascript
const v8 = require('node:v8');

class MemoryMonitor {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 30000;
    this.thresholdMb = options.thresholdMb || 100;
    this.history = [];
    this.baseline = null;
  }

  start() {
    this.timer = setInterval(() => this.check(), this.intervalMs);
    this.baseline = this.getHeapUsed();
    console.log(`Memory monitor started. Baseline: ${this.baseline.toFixed(2)}MB`);
  }

  stop() {
    clearInterval(this.timer);
  }

  getHeapUsed() {
    const stats = v8.getHeapStatistics();
    return stats.used_heap_size / 1024 / 1024;
  }

  check() {
    const current = this.getHeapUsed();
    const delta = current - this.baseline;

    this.history.push({
      timestamp: Date.now(),
      used: current,
      delta
    });

    // Keep last 100 measurements
    if (this.history.length > 100) {
      this.history.shift();
    }

    // Check for consistent growth
    if (this.history.length >= 10) {
      const recent = this.history.slice(-10);
      const allGrowing = recent.every((m, i) =>
        i === 0 || m.used > recent[i - 1].used
      );

      if (allGrowing && delta > this.thresholdMb) {
        console.warn(`[MEMORY WARNING] Heap grew by ${delta.toFixed(2)}MB`);
        console.warn(`  Current: ${current.toFixed(2)}MB`);
        console.warn(`  Baseline: ${this.baseline.toFixed(2)}MB`);
      }
    }
  }

  getStats() {
    return {
      baseline: this.baseline,
      current: this.getHeapUsed(),
      history: this.history
    };
  }
}
```

### Finding Leaks with Async Hooks

```javascript
const async_hooks = require('node:async_hooks');

const resources = new Map();

const hook = async_hooks.createHook({
  init(asyncId, type, triggerAsyncId) {
    const stack = new Error().stack;
    resources.set(asyncId, {
      type,
      triggerAsyncId,
      stack,
      timestamp: Date.now()
    });
  },
  destroy(asyncId) {
    resources.delete(asyncId);
  }
});

hook.enable();

// Periodically check for long-lived resources
setInterval(() => {
  const now = Date.now();
  const longLived = [];

  for (const [id, resource] of resources) {
    if (now - resource.timestamp > 60000) {  // Older than 1 minute
      longLived.push({ id, ...resource });
    }
  }

  if (longLived.length > 0) {
    console.log(`Long-lived resources: ${longLived.length}`);
    // Group by type
    const byType = {};
    for (const r of longLived) {
      byType[r.type] = (byType[r.type] || 0) + 1;
    }
    console.log(byType);
  }
}, 30000);
```

### Common Leak Patterns

#### Unbounded Caches

```javascript
// LEAK: Cache grows forever
const cache = new Map();

function getData(key) {
  if (!cache.has(key)) {
    cache.set(key, fetchData(key));
  }
  return cache.get(key);
}

// FIX: Use LRU cache
const LRU = require('lru-cache');
const cache = new LRU({
  max: 500,
  ttl: 1000 * 60 * 5  // 5 minutes
});
```

#### Event Listener Leaks

```javascript
// LEAK: Listeners added but never removed
function subscribe(emitter, handler) {
  emitter.on('data', handler);
  // Never cleaned up!
}

// FIX: Return cleanup function
function subscribe(emitter, handler) {
  emitter.on('data', handler);
  return () => emitter.off('data', handler);
}

// Or use AbortController
function subscribe(emitter, handler, signal) {
  emitter.on('data', handler);
  signal?.addEventListener('abort', () => {
    emitter.off('data', handler);
  });
}
```

#### Closure Retention

```javascript
// LEAK: Closure retains large data
function createProcessor(largeData) {
  // Process data
  const summary = processData(largeData);

  // This closure retains largeData even though it only needs summary
  return function() {
    return summary;
  };
}

// FIX: Don't capture unnecessary variables
function createProcessor(largeData) {
  const summary = processData(largeData);
  // largeData can now be GC'd

  return function() {
    return summary;
  };
}
```

#### Timer Leaks

```javascript
// LEAK: Timers holding references
class Service {
  start() {
    this.timer = setInterval(() => {
      this.doWork();  // 'this' keeps Service alive
    }, 1000);
  }

  // stop() never called
}

// FIX: Clean up timers
class Service {
  start() {
    this.timer = setInterval(() => this.doWork(), 1000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
```

## Native Memory Debugging

### Tracking External Memory

```javascript
const v8 = require('node:v8');

// V8 tracks external memory (Buffers, etc.)
const stats = v8.getHeapStatistics();
console.log('External memory:', stats.external_memory / 1024 / 1024, 'MB');
```

### Using process.memoryUsage()

```javascript
function logMemory() {
  const usage = process.memoryUsage();
  console.log({
    rss: (usage.rss / 1024 / 1024).toFixed(2) + ' MB',
    heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
    heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
    external: (usage.external / 1024 / 1024).toFixed(2) + ' MB',
    arrayBuffers: (usage.arrayBuffers / 1024 / 1024).toFixed(2) + ' MB'
  });
}

// RSS (Resident Set Size) = Total memory allocated to process
// heapTotal = V8 heap size
// heapUsed = V8 heap used
// external = V8 external memory (Buffers, etc.)
// arrayBuffers = ArrayBuffer and SharedArrayBuffer allocations
```

### Native Memory with Valgrind

```bash
# Build Node.js with debug symbols
./configure --debug
make -j$(nproc)

# Run with Valgrind
valgrind --leak-check=full \
  --show-leak-kinds=all \
  --track-origins=yes \
  ./node --expose-gc script.js
```

### Address Sanitizer

```bash
# Build with ASan
./configure --enable-asan
make -j$(nproc)

# Run
ASAN_OPTIONS=detect_leaks=1 ./node script.js
```

## Tools

### Clinic.js Heap Profiler

```bash
npm install -g clinic
clinic heapprofiler -- node app.js
```

### memwatch-next

```javascript
const memwatch = require('@airbnb/node-memwatch');

memwatch.on('leak', (info) => {
  console.log('Memory leak detected:', info);
});

memwatch.on('stats', (stats) => {
  console.log('GC stats:', stats);
});

// Take heap diff
const hd = new memwatch.HeapDiff();
// ... run code ...
const diff = hd.end();
console.log('Heap diff:', JSON.stringify(diff, null, 2));
```

### Node.js --heapsnapshot-signal

```bash
# Take heap snapshot on signal
node --heapsnapshot-signal=SIGUSR2 app.js

# In another terminal
kill -USR2 $(pgrep -f "node app.js")
```

## Debugging OOM (Out of Memory)

### Capture Heap Snapshot on OOM

```bash
# Generate heap snapshot before crashing
node --heapsnapshot-near-heap-limit=3 app.js
```

### Increase Memory Gradually

```bash
# Start with low memory to trigger OOM faster during debugging
node --max-old-space-size=256 app.js
```

### Analyze Core Dump

```bash
# Enable core dumps
ulimit -c unlimited

# Run until crash
node --abort-on-uncaught-exception app.js

# Analyze with lldb/gdb
lldb node -c core.12345
(lldb) bt
```

## Best Practices

### WeakRef and FinalizationRegistry

```javascript
// Use WeakRef for caches that shouldn't prevent GC
const cache = new Map();

function cacheObject(key, obj) {
  cache.set(key, new WeakRef(obj));
}

function getCached(key) {
  const ref = cache.get(key);
  if (ref) {
    const obj = ref.deref();
    if (obj) return obj;
    // Object was GC'd
    cache.delete(key);
  }
  return undefined;
}

// FinalizationRegistry for cleanup
const registry = new FinalizationRegistry((key) => {
  console.log(`Object with key ${key} was garbage collected`);
  cache.delete(key);
});

function cacheWithCleanup(key, obj) {
  cache.set(key, new WeakRef(obj));
  registry.register(obj, key);
}
```

### Streaming Large Data

```javascript
// BAD: Load entire file into memory
const data = await fs.promises.readFile('huge-file.json');
const parsed = JSON.parse(data);

// GOOD: Stream processing
const { pipeline } = require('node:stream/promises');
const JSONStream = require('JSONStream');

await pipeline(
  fs.createReadStream('huge-file.json'),
  JSONStream.parse('items.*'),
  async function* (source) {
    for await (const item of source) {
      yield processItem(item);
    }
  },
  fs.createWriteStream('output.json')
);
```

### Object Pooling

```javascript
class ObjectPool {
  constructor(factory, reset, initialSize = 10) {
    this.factory = factory;
    this.reset = reset;
    this.pool = [];

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire() {
    return this.pool.length > 0 ? this.pool.pop() : this.factory();
  }

  release(obj) {
    this.reset(obj);
    this.pool.push(obj);
  }
}

// Usage
const bufferPool = new ObjectPool(
  () => Buffer.allocUnsafe(1024),
  (buf) => buf.fill(0)
);
```

## References

- Chrome DevTools Memory Panel: https://developer.chrome.com/docs/devtools/memory-problems/
- V8 Memory Management: https://v8.dev/blog/trash-talk
- Node.js Diagnostics Working Group: https://github.com/nodejs/diagnostics
