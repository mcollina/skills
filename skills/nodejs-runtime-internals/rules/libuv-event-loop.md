---
name: libuv-event-loop
description: libuv event loop phases, timers, I/O, idle, check, close
metadata:
  tags: libuv, event-loop, async, timers, io, phases
---

# libuv Event Loop

The event loop is the heart of Node.js's asynchronous model. Understanding its phases is essential for debugging timing issues and optimizing performance.

## Event Loop Architecture

```
   ┌───────────────────────────┐
┌─>│           timers          │ <- setTimeout, setInterval
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │ <- I/O callbacks deferred from previous loop
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │       idle, prepare       │ <- internal use only
│  └─────────────┬─────────────┘      ┌───────────────┐
│  ┌─────────────┴─────────────┐      │   incoming:   │
│  │           poll            │<─────┤  connections, │
│  └─────────────┬─────────────┘      │   data, etc.  │
│  ┌─────────────┴─────────────┐      └───────────────┘
│  │           check           │ <- setImmediate
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──┤      close callbacks      │ <- socket.on('close', ...)
   └───────────────────────────┘
```

## Event Loop Phases

### 1. Timers Phase

Executes callbacks scheduled by `setTimeout()` and `setInterval()`.

```javascript
// Timer callbacks execute when their threshold is reached
setTimeout(() => console.log('timer'), 100);

// Multiple timers with same delay execute in order of scheduling
setTimeout(() => console.log('first'), 100);
setTimeout(() => console.log('second'), 100);
```

**Important**: Timers specify a *minimum* delay, not exact timing:

```javascript
const start = Date.now();

setTimeout(() => {
  console.log(`Actual delay: ${Date.now() - start}ms`);
  // May be > 100ms if event loop is blocked
}, 100);

// Blocking code delays timer execution
while (Date.now() - start < 50) {
  // This blocks for 50ms
}
```

### 2. Pending Callbacks Phase

Executes I/O callbacks deferred from the previous loop iteration (e.g., TCP errors).

```javascript
// Some system operations defer callbacks to this phase
const net = require('node:net');

const server = net.createServer();
server.on('error', (err) => {
  // ECONNREFUSED and similar errors may fire here
  console.error('Server error:', err);
});
```

### 3. Idle, Prepare Phase

Internal to libuv. Not directly accessible from JavaScript.

Used for internal housekeeping before polling for I/O.

### 4. Poll Phase

The poll phase:
1. Calculates how long to block waiting for I/O
2. Processes events in the poll queue

```javascript
const fs = require('node:fs');

// File I/O callbacks execute during poll phase
fs.readFile('/etc/passwd', (err, data) => {
  console.log('File read callback - poll phase');
});

// Network I/O also executes during poll
const net = require('node:net');
const socket = net.connect(80, 'example.com');
socket.on('data', (chunk) => {
  console.log('Socket data callback - poll phase');
});
```

**Poll behavior**:
- If poll queue is not empty: execute callbacks synchronously until queue is empty or system limit reached
- If poll queue is empty:
  - If `setImmediate()` is scheduled: end poll phase and move to check phase
  - If timers are due: wrap around to timers phase
  - Otherwise: wait for callbacks to be added

### 5. Check Phase

Executes `setImmediate()` callbacks immediately after poll phase.

```javascript
setImmediate(() => {
  console.log('setImmediate callback - check phase');
});
```

### 6. Close Callbacks Phase

Executes close event callbacks (e.g., `socket.on('close', ...)`).

```javascript
const net = require('node:net');

const socket = net.connect(80, 'example.com');
socket.on('close', () => {
  console.log('Socket closed - close callbacks phase');
});
socket.destroy();
```

## Microtasks and nextTick

`process.nextTick()` and Promise callbacks (microtasks) execute between phases:

```
       ┌──────────────────┐
       │ Current Phase    │
       └────────┬─────────┘
                │
                ▼
    ┌───────────────────────┐
    │   nextTick queue      │ <- process.nextTick()
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │   microtask queue     │ <- Promise.resolve().then()
    └───────────┬───────────┘
                │
                ▼
       ┌────────────────┐
       │  Next Phase    │
       └────────────────┘
```

```javascript
// Execution order example
setImmediate(() => console.log('1. setImmediate'));
setTimeout(() => console.log('2. setTimeout'), 0);

Promise.resolve().then(() => console.log('3. Promise'));
process.nextTick(() => console.log('4. nextTick'));

console.log('5. sync');

// Output (may vary for setTimeout vs setImmediate):
// 5. sync
// 4. nextTick
// 3. Promise
// 2. setTimeout (or 1. setImmediate)
// 1. setImmediate (or 2. setTimeout)
```

### nextTick Starvation

```javascript
// BAD: Recursive nextTick starves I/O
function recursiveNextTick() {
  process.nextTick(recursiveNextTick);
}
recursiveNextTick();
// I/O callbacks will NEVER execute!

// GOOD: Use setImmediate for recursion
function recursiveImmediate() {
  setImmediate(recursiveImmediate);
}
// I/O can still execute between iterations
```

## setTimeout vs setImmediate

In the main module, order is non-deterministic:

```javascript
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));

// Order depends on process performance
// Sometimes: timeout, immediate
// Sometimes: immediate, timeout
```

Within an I/O callback, `setImmediate` always first:

```javascript
const fs = require('node:fs');

fs.readFile('/etc/passwd', () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
});

// Always: immediate, timeout
// Because we're in poll phase, moving to check phase next
```

## Debugging Event Loop

### Event Loop Lag

```javascript
const CHECK_INTERVAL = 1000;

let lastCheck = Date.now();

setInterval(() => {
  const now = Date.now();
  const lag = now - lastCheck - CHECK_INTERVAL;
  if (lag > 100) {
    console.warn(`Event loop lag: ${lag}ms`);
  }
  lastCheck = now;
}, CHECK_INTERVAL);
```

### Using Async Hooks

```javascript
const async_hooks = require('node:async_hooks');

// Track async operation timing
const asyncTiming = new Map();

const hook = async_hooks.createHook({
  init(asyncId, type, triggerAsyncId) {
    asyncTiming.set(asyncId, {
      type,
      start: Date.now(),
      trigger: triggerAsyncId
    });
  },
  destroy(asyncId) {
    const timing = asyncTiming.get(asyncId);
    if (timing) {
      const duration = Date.now() - timing.start;
      if (duration > 1000) {
        console.log(`Long async op: ${timing.type} took ${duration}ms`);
      }
      asyncTiming.delete(asyncId);
    }
  }
});

hook.enable();
```

### libuv Metrics (Node.js 18+)

```javascript
const { monitorEventLoopDelay } = require('node:perf_hooks');

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

setInterval(() => {
  console.log({
    min: histogram.min / 1e6 + 'ms',
    max: histogram.max / 1e6 + 'ms',
    mean: histogram.mean / 1e6 + 'ms',
    stddev: histogram.stddev / 1e6 + 'ms',
    p99: histogram.percentile(99) / 1e6 + 'ms'
  });
  histogram.reset();
}, 5000);
```

## Common Issues

### Blocking the Event Loop

```javascript
// BAD: Synchronous file operations block
const data = fs.readFileSync('large-file.txt');
// Event loop blocked during entire read

// GOOD: Async operations
const data = await fs.promises.readFile('large-file.txt');

// BAD: CPU-intensive computation
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
fibonacci(45); // Blocks for seconds!

// GOOD: Move to worker thread
const { Worker } = require('node:worker_threads');
const worker = new Worker('./fib-worker.js');
```

### Timer Coalescing

```javascript
// Many timers with similar delays may coalesce
for (let i = 0; i < 1000; i++) {
  setTimeout(() => {
    // These may execute in batches, not individually
  }, 100 + i);
}

// Consider using a single timer with internal scheduling
class Scheduler {
  constructor() {
    this.tasks = [];
    this.timer = null;
  }

  schedule(callback, delay) {
    const executeAt = Date.now() + delay;
    this.tasks.push({ callback, executeAt });
    this.tasks.sort((a, b) => a.executeAt - b.executeAt);
    this.reschedule();
  }

  reschedule() {
    clearTimeout(this.timer);
    if (this.tasks.length === 0) return;

    const delay = Math.max(0, this.tasks[0].executeAt - Date.now());
    this.timer = setTimeout(() => this.tick(), delay);
  }

  tick() {
    const now = Date.now();
    while (this.tasks.length && this.tasks[0].executeAt <= now) {
      const { callback } = this.tasks.shift();
      callback();
    }
    this.reschedule();
  }
}
```

### I/O Priority

```javascript
// Poll phase can be delayed by timers
// Use setImmediate for I/O-related callbacks

const server = http.createServer((req, res) => {
  // Schedule response processing for next check phase
  setImmediate(() => {
    // This ensures I/O polling happens first
    processRequest(req, res);
  });
});
```

## libuv Internals

### Event Loop in C

```c
// Simplified uv_run loop (from libuv source)
int uv_run(uv_loop_t* loop, uv_run_mode mode) {
  while (uv__loop_alive(loop)) {
    uv__update_time(loop);
    uv__run_timers(loop);
    uv__run_pending(loop);
    uv__run_idle(loop);
    uv__run_prepare(loop);

    timeout = uv_backend_timeout(loop);
    uv__io_poll(loop, timeout);

    uv__run_check(loop);
    uv__run_closing_handles(loop);
  }
}
```

### UV_RUN Modes

```javascript
// Node.js uses UV_RUN_DEFAULT internally
// UV_RUN_DEFAULT: run until no more work
// UV_RUN_ONCE: run once, may block
// UV_RUN_NOWAIT: run once, don't block
```

## References

- libuv documentation: http://docs.libuv.org/
- libuv source: `deps/uv/` in Node.js source
- Node.js Event Loop guide: https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/
