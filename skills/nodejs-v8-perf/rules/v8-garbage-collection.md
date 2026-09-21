---
name: v8-garbage-collection
description: V8 garbage collection internals - Scavenger, Mark-Sweep, Mark-Compact, generational GC
metadata:
  tags: v8, gc, garbage-collection, memory, performance, scavenger, mark-sweep
---

# V8 Garbage Collection

Understanding V8's garbage collection is critical for writing performant Node.js applications and debugging memory issues. V8 uses a generational garbage collector with different strategies for young and old objects.

## Memory Layout

V8 divides the heap into several spaces:

```
+------------------+
|   New Space      |  <- Young generation (Scavenger)
|  (Semi-spaces)   |
+------------------+
|   Old Space      |  <- Old generation (Mark-Sweep/Compact)
+------------------+
|   Large Object   |  <- Objects > 512KB
|      Space       |
+------------------+
|   Code Space     |  <- Compiled code
+------------------+
|   Map Space      |  <- Hidden classes (Maps)
+------------------+
```

### Heap Size Configuration

```javascript
// Get current heap statistics
const v8 = require('node:v8');
const stats = v8.getHeapStatistics();

console.log({
  heapTotal: stats.total_heap_size / 1024 / 1024 + ' MB',
  heapUsed: stats.used_heap_size / 1024 / 1024 + ' MB',
  heapLimit: stats.heap_size_limit / 1024 / 1024 + ' MB',
  mallocedMemory: stats.malloced_memory / 1024 / 1024 + ' MB',
  externalMemory: stats.external_memory / 1024 / 1024 + ' MB',
});
```

Configure heap limits:

```bash
# Set max old space size (default ~1.4GB on 64-bit)
node --max-old-space-size=4096 app.js

# Set max semi-space size (affects young generation)
node --max-semi-space-size=64 app.js

# Set initial heap size
node --initial-heap-size=256 app.js
```

## Scavenger (Minor GC)

The Scavenger handles young generation collection using a semi-space copying algorithm. It's fast but requires 2x the memory for the young generation.

### How It Works

1. **Allocation**: Objects are allocated in the "from" semi-space
2. **Collection**: Live objects are copied to the "to" semi-space
3. **Promotion**: Objects surviving 2 collections are promoted to old space
4. **Swap**: Semi-spaces swap roles

```
Before GC:
+----------------+    +----------------+
|  From Space    |    |  To Space      |
|  [A][B][C][D]  |    |  (empty)       |
+----------------+    +----------------+

After GC (B and D are dead):
+----------------+    +----------------+
|  From Space    |    |  To Space      |
|  (empty)       |    |  [A][C]        |
+----------------+    +----------------+
```

### Scavenger Performance Implications

```javascript
// BAD: Creating many short-lived objects triggers frequent Scavenger runs
function processData(items) {
  return items.map(item => ({
    ...item,
    processed: true,
    timestamp: new Date(), // New object each time
    meta: { source: 'api' } // New object each time
  }));
}

// BETTER: Reuse objects where possible
const META = Object.freeze({ source: 'api' });

function processData(items) {
  const results = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    results[i] = {
      ...items[i],
      processed: true,
      timestamp: Date.now(), // Primitive, not object
      meta: META // Shared reference
    };
  }
  return results;
}
```

### Object Pooling for High-Allocation Scenarios

```javascript
class ObjectPool {
  constructor(factory, reset, initialSize = 100) {
    this.factory = factory;
    this.reset = reset;
    this.pool = [];

    // Pre-allocate objects
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire() {
    return this.pool.length > 0
      ? this.pool.pop()
      : this.factory();
  }

  release(obj) {
    this.reset(obj);
    this.pool.push(obj);
  }
}

// Usage
const bufferPool = new ObjectPool(
  () => Buffer.allocUnsafe(4096),
  (buf) => buf.fill(0)
);

const buf = bufferPool.acquire();
// ... use buffer
bufferPool.release(buf);
```

## Mark-Sweep (Major GC)

Mark-Sweep handles old generation collection. It's a stop-the-world collector that marks live objects and then sweeps (frees) dead ones.

### Phases

1. **Marking**: Traverse from roots, mark all reachable objects
2. **Sweeping**: Iterate heap, free unmarked objects

```javascript
// Roots include:
// - Global objects (globalThis)
// - Stack variables
// - Active handles (timers, I/O)
// - Persistent handles from native addons

// Objects reachable from roots survive
globalThis.cache = largeObject; // Keeps largeObject alive

// Removing reference allows collection
delete globalThis.cache; // largeObject can now be collected
```

### Incremental Marking

V8 uses incremental marking to reduce pause times:

```bash
# Trace GC events
node --trace-gc app.js

# Example output:
# [12345:0x...]   100 ms: Scavenge 4.2 (6.0) -> 3.8 (7.0) MB, 1.2 / 0.0 ms
# [12345:0x...]   500 ms: Mark-sweep 15.2 (20.0) -> 12.1 (20.0) MB, 50.3 / 0.0 ms (+ 10.2 ms in 5 steps)
```

The `(+ 10.2 ms in 5 steps)` indicates incremental marking.

### Write Barriers

V8 uses write barriers to track cross-generation references:

```javascript
// When old object references young object,
// V8 must remember to scan old object during Scavenge
const oldObject = {}; // Promoted to old space
// ... later
oldObject.child = {}; // New object in young space
// Write barrier records this reference
```

## Mark-Compact

When heap fragmentation is high, V8 performs Mark-Compact instead of Mark-Sweep:

1. **Marking**: Same as Mark-Sweep
2. **Compacting**: Move live objects to eliminate gaps

```
Before Compaction:
[LIVE][    ][LIVE][    ][    ][LIVE][    ]

After Compaction:
[LIVE][LIVE][LIVE][                      ]
                  ^ Free space consolidated
```

### Compaction Overhead

Compaction is expensive because it requires updating all pointers. V8 avoids it when possible:

```bash
# Force GC (for debugging only)
node --expose-gc -e "
  global.gc();  // Minor GC
  global.gc({ type: 'major' });  // Major GC
  global.gc({ type: 'major', execution: 'sync' });  // Synchronous major GC
"
```

## Generational Hypothesis

V8's GC is based on the generational hypothesis: most objects die young.

```javascript
// Short-lived objects (ideal case)
function handleRequest(req) {
  const data = JSON.parse(req.body); // Dies quickly
  const result = processData(data);  // Dies quickly
  return JSON.stringify(result);     // Dies quickly
}

// Long-lived objects (cache, connections)
const connectionPool = new Pool(); // Lives forever
const cache = new LRUCache();      // Lives forever
```

### Allocation Site Feedback

V8 tracks allocation sites to optimize object placement:

```javascript
// V8 learns that objects from this function live long
function createLongLivedConfig() {
  return {
    setting1: 'value1',
    setting2: 'value2',
    // After profiling, V8 may allocate directly in old space
  };
}

// Called once at startup
const config = createLongLivedConfig();
```

## Debugging GC Issues

### GC Tracing Flags

```bash
# Basic GC tracing
node --trace-gc app.js

# Detailed GC tracing
node --trace-gc-verbose app.js

# GC statistics at exit
node --trace-gc-object-stats app.js

# Trace GC causes
node --trace-gc-nvp app.js
```

### Heap Snapshots

```javascript
const v8 = require('node:v8');
const fs = require('node:fs');

// Write heap snapshot
function writeHeapSnapshot() {
  const filename = v8.writeHeapSnapshot();
  console.log(`Heap snapshot written to ${filename}`);
  return filename;
}

// Stream heap snapshot (lower memory overhead)
function streamHeapSnapshot() {
  const filename = `heap-${Date.now()}.heapsnapshot`;
  const stream = fs.createWriteStream(filename);
  v8.writeHeapSnapshot(filename);
  return filename;
}
```

### Detecting Memory Leaks

```javascript
const v8 = require('node:v8');

class MemoryMonitor {
  constructor(intervalMs = 30000) {
    this.baseline = null;
    this.history = [];

    setInterval(() => this.check(), intervalMs);
  }

  check() {
    const stats = v8.getHeapStatistics();
    const used = stats.used_heap_size;

    if (!this.baseline) {
      this.baseline = used;
      return;
    }

    this.history.push({
      timestamp: Date.now(),
      used,
      delta: used - this.baseline
    });

    // Keep last 100 measurements
    if (this.history.length > 100) {
      this.history.shift();
    }

    // Check for consistent growth
    if (this.history.length >= 10) {
      const recent = this.history.slice(-10);
      const allGrowing = recent.every((m, i) =>
        i === 0 || m.used >= recent[i-1].used
      );

      if (allGrowing) {
        console.warn('Possible memory leak detected');
        console.warn(`Heap grew from ${this.baseline} to ${used}`);
      }
    }
  }
}
```

## Common Pitfalls

### Closure Memory Retention

```javascript
// BAD: Closure retains large array
function createHandler(largeData) {
  return function handler() {
    // Even if we don't use largeData, it's retained
    return 'done';
  };
}

// GOOD: Don't capture unnecessary variables
function createHandler(largeData) {
  const result = processData(largeData);
  // largeData can be collected now
  return function handler() {
    return result;
  };
}
```

### Unintentional Global References

```javascript
// BAD: Accidental global
function processData(data) {
  results = data.map(transform); // Missing 'const' - creates global
  return results;
}

// GOOD: Use strict mode and proper declarations
'use strict';
function processData(data) {
  const results = data.map(transform);
  return results;
}
```

### Timer/Event Listener Leaks

```javascript
// BAD: Timer keeps callback and its closure alive
function startMonitoring(data) {
  setInterval(() => {
    console.log(data.value); // data is retained forever
  }, 1000);
}

// GOOD: Store timer reference and clear when done
class Monitor {
  constructor(data) {
    this.data = data;
    this.timer = setInterval(() => this.check(), 1000);
  }

  check() {
    console.log(this.data.value);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.data = null; // Allow GC
  }
}
```

## Performance Tuning

### Reduce GC Pressure

```javascript
// 1. Pre-allocate arrays when size is known
const results = new Array(items.length);
for (let i = 0; i < items.length; i++) {
  results[i] = transform(items[i]);
}

// 2. Reuse buffers
const sharedBuffer = Buffer.allocUnsafe(65536);
function processChunk(data) {
  data.copy(sharedBuffer);
  // Process in-place
}

// 3. Use TypedArrays for numeric data
const data = new Float64Array(1000);
// Much more GC-friendly than Array of Numbers
```

### Optimize for Old Space

For long-lived data structures:

```javascript
// Pre-allocate and fill immediately
// This helps V8 understand the object shape
const cache = Object.create(null);
const INITIAL_KEYS = ['user:', 'session:', 'token:'];
INITIAL_KEYS.forEach(k => { cache[k] = undefined; });

// Use Map for dynamic keys (better for old space)
const dynamicCache = new Map();
```

## References

- V8 Blog: https://v8.dev/blog
- V8 GC Source: `deps/v8/src/heap/` in Node.js source
- `node --v8-options | grep gc` for all GC-related flags
