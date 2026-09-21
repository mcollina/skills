---
name: libuv-thread-pool
description: libuv thread pool size, blocking operations, UV_THREADPOOL_SIZE
metadata:
  tags: libuv, thread-pool, async, blocking, uv-threadpool-size, performance
---

# libuv Thread Pool

libuv uses a thread pool for operations that can't be performed asynchronously at the OS level. Understanding the thread pool is essential for avoiding bottlenecks.

## Thread Pool Overview

The thread pool handles:
- **File system operations** (`fs.*` except FSWatcher)
- **DNS** (`dns.lookup()`, not `dns.resolve*()`)
- **Crypto** (some operations like `crypto.pbkdf2()`, `crypto.randomBytes()`)
- **Zlib** (compression/decompression)
- **Custom C++ addons** using `uv_queue_work`

```
Main Thread (Event Loop)
        │
        ├──> Timer callbacks (no thread pool)
        ├──> Network I/O (no thread pool - uses epoll/kqueue/IOCP)
        │
        └──> Thread Pool (blocking ops)
             ├── Thread 1: fs.readFile()
             ├── Thread 2: dns.lookup()
             ├── Thread 3: crypto.pbkdf2()
             └── Thread 4: zlib.gzip()
```

## Default Pool Size

The default thread pool size is **4 threads**.

```bash
# Check default
node -e "console.log(process.env.UV_THREADPOOL_SIZE || 4)"
```

This means only 4 blocking operations can execute concurrently!

## UV_THREADPOOL_SIZE

Configure the pool size at startup:

```bash
# Increase thread pool (must be set before Node.js starts)
UV_THREADPOOL_SIZE=16 node app.js

# Maximum is 1024
UV_THREADPOOL_SIZE=128 node app.js
```

```javascript
// WRONG: Setting after Node.js starts has no effect
process.env.UV_THREADPOOL_SIZE = 16; // Too late!

// Must be set before Node.js initialization:
// - In shell: export UV_THREADPOOL_SIZE=16
// - In package.json scripts: "start": "UV_THREADPOOL_SIZE=16 node app.js"
// - In systemd: Environment=UV_THREADPOOL_SIZE=16
```

## Thread Pool Starvation

### The Problem

```javascript
const fs = require('node:fs/promises');
const dns = require('node:dns/promises');

// With default pool size of 4:
async function handleRequest(hostname) {
  // These ALL use the thread pool:
  const [
    file1,
    file2,
    file3,
    file4,
    resolved  // This waits for a free thread!
  ] = await Promise.all([
    fs.readFile('config1.json'),
    fs.readFile('config2.json'),
    fs.readFile('config3.json'),
    fs.readFile('config4.json'),
    dns.lookup(hostname)  // Blocked until a thread is free
  ]);
}
```

### Detecting Starvation

```javascript
const dns = require('node:dns');

// DNS lookup is a good canary for thread pool saturation
function measureThreadPoolLatency() {
  const start = process.hrtime.bigint();

  dns.lookup('localhost', (err) => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;

    if (ms > 10) {
      console.warn(`Thread pool latency: ${ms.toFixed(2)}ms`);
    }
  });
}

setInterval(measureThreadPoolLatency, 1000);
```

### Monitoring with Async Hooks

```javascript
const async_hooks = require('node:async_hooks');
const fs = require('node:fs');

// Track thread pool operations
const threadPoolTypes = new Set([
  'FSREQCALLBACK',
  'FSREQPROMISE',
  'GETADDRINFOREQWRAP',
  'GETNAMEINFOREQWRAP',
  'PBKDF2REQUEST',
  'RANDOMBYTESREQUEST',
  'SCRYPTREQUEST',
  'SIGNREQUEST',
  'VERIFYREQUEST',
  'ZLIB'
]);

let activeThreadPoolOps = 0;
let maxConcurrent = 0;

const hook = async_hooks.createHook({
  init(asyncId, type) {
    if (threadPoolTypes.has(type)) {
      activeThreadPoolOps++;
      maxConcurrent = Math.max(maxConcurrent, activeThreadPoolOps);
    }
  },
  destroy(asyncId, type) {
    // Note: type not available in destroy, need to track separately
  }
});

hook.enable();

setInterval(() => {
  console.log(`Active thread pool ops: ${activeThreadPoolOps}, max: ${maxConcurrent}`);
  maxConcurrent = activeThreadPoolOps;
}, 5000);
```

## Operations That Use Thread Pool

### File System (All Operations)

```javascript
const fs = require('node:fs');

// ALL of these use the thread pool:
fs.readFile('file.txt', callback);
fs.writeFile('file.txt', data, callback);
fs.stat('file.txt', callback);
fs.readdir('.', callback);
fs.open('file.txt', 'r', callback);
// Even metadata operations!

// Exception: fs.watch() / fs.watchFile() use OS facilities
fs.watch('.', (event, filename) => {
  // This does NOT use thread pool
});
```

### DNS Lookup (Not Resolve)

```javascript
const dns = require('node:dns');

// Uses thread pool (calls getaddrinfo)
dns.lookup('example.com', callback);

// Does NOT use thread pool (uses c-ares)
dns.resolve('example.com', callback);
dns.resolve4('example.com', callback);
dns.resolveMx('example.com', callback);
```

**Recommendation**: Prefer `dns.resolve*()` for high-throughput:

```javascript
const dns = require('node:dns');

// BAD: Thread pool bottleneck
async function resolveMany(hostnames) {
  return Promise.all(
    hostnames.map(h => dns.promises.lookup(h))
  );
}

// GOOD: Uses c-ares, no thread pool
async function resolveMany(hostnames) {
  return Promise.all(
    hostnames.map(h => dns.promises.resolve4(h))
  );
}
```

### Crypto Operations

```javascript
const crypto = require('node:crypto');

// Uses thread pool:
crypto.pbkdf2(password, salt, iterations, keylen, 'sha512', callback);
crypto.randomBytes(256, callback);
crypto.scrypt(password, salt, keylen, callback);

// Does NOT use thread pool (runs on main thread):
crypto.createHash('sha256').update(data).digest();
crypto.createCipheriv(algorithm, key, iv);
```

### Zlib

```javascript
const zlib = require('node:zlib');

// Uses thread pool:
zlib.gzip(buffer, callback);
zlib.gunzip(buffer, callback);
zlib.deflate(buffer, callback);
zlib.inflate(buffer, callback);

// Sync versions block main thread (avoid!):
zlib.gzipSync(buffer); // BAD
```

## Sizing the Thread Pool

### Formula

```javascript
// Optimal size depends on:
// 1. Number of CPU cores
// 2. Nature of blocking operations
// 3. Concurrent request load

const os = require('node:os');

// For I/O-heavy workloads:
// More threads than CPUs is fine (threads are often waiting)
const ioHeavySize = Math.max(os.cpus().length * 2, 4);

// For CPU-heavy workloads (crypto):
// Match CPU count to avoid context switching
const cpuHeavySize = os.cpus().length;

// For mixed workloads:
// Balance between I/O wait and CPU usage
const mixedSize = Math.max(os.cpus().length * 1.5, 4);
```

### Monitoring to Determine Size

```javascript
const { monitorEventLoopDelay } = require('node:perf_hooks');

// Monitor event loop delay
const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

// If p99 latency is high, thread pool may be saturated
setInterval(() => {
  const p99 = histogram.percentile(99) / 1e6;
  if (p99 > 100) {
    console.warn(`Event loop p99: ${p99.toFixed(2)}ms - consider increasing UV_THREADPOOL_SIZE`);
  }
  histogram.reset();
}, 10000);
```

## Avoiding Thread Pool

### Use Network-Based Alternatives

```javascript
// Instead of file system for caching:
// Use Redis, Memcached, or in-memory cache

const { LRUCache } = require('lru-cache');
const cache = new LRUCache({ max: 500 });

// Instead of dns.lookup():
// Use dns.resolve4() with custom caching

const dnsCache = new Map();

async function cachedResolve(hostname) {
  if (dnsCache.has(hostname)) {
    return dnsCache.get(hostname);
  }

  const addresses = await dns.promises.resolve4(hostname);
  dnsCache.set(hostname, addresses[0]);

  // Expire after 5 minutes
  setTimeout(() => dnsCache.delete(hostname), 5 * 60 * 1000);

  return addresses[0];
}
```

### Use Worker Threads for CPU-Heavy Work

```javascript
const { Worker, isMainThread, parentPort } = require('node:worker_threads');

if (isMainThread) {
  // Main thread: dispatch work to workers
  const worker = new Worker(__filename);

  worker.postMessage({ password: 'secret', salt: 'random' });
  worker.on('message', (hash) => {
    console.log('Hash:', hash);
  });
} else {
  // Worker thread: do CPU-heavy work
  const crypto = require('node:crypto');

  parentPort.on('message', ({ password, salt }) => {
    // This runs in worker, not thread pool
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
    parentPort.postMessage(hash.toString('hex'));
  });
}
```

### Stream Large Files

```javascript
const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');

// BAD: Holds thread pool slot for entire read
const data = await fs.promises.readFile('huge-file.txt');

// BETTER: Streaming uses thread pool in small chunks
await pipeline(
  fs.createReadStream('huge-file.txt'),
  processStream,
  fs.createWriteStream('output.txt')
);
```

## Thread Pool in Native Addons

When writing C++ addons, use `uv_queue_work` for blocking operations:

```cpp
#include <napi.h>
#include <uv.h>

struct WorkData {
  std::string input;
  std::string result;
  Napi::ThreadSafeFunction tsfn;
};

// Runs on thread pool thread
void Execute(uv_work_t* req) {
  WorkData* data = static_cast<WorkData*>(req->data);
  // Do blocking work here
  data->result = expensiveOperation(data->input);
}

// Runs on main thread after Execute completes
void Complete(uv_work_t* req, int status) {
  WorkData* data = static_cast<WorkData*>(req->data);

  data->tsfn.BlockingCall([data](Napi::Env env, Napi::Function callback) {
    callback.Call({Napi::String::New(env, data->result)});
  });

  data->tsfn.Release();
  delete data;
  delete req;
}

Napi::Value QueueWork(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  auto* data = new WorkData();
  data->input = info[0].As<Napi::String>().Utf8Value();
  data->tsfn = Napi::ThreadSafeFunction::New(
    env, info[1].As<Napi::Function>(), "work", 0, 1
  );

  auto* req = new uv_work_t();
  req->data = data;

  uv_queue_work(uv_default_loop(), req, Execute, Complete);

  return env.Undefined();
}
```

## Best Practices

1. **Increase pool size for I/O-heavy apps**: `UV_THREADPOOL_SIZE=16` or more

2. **Use `dns.resolve*()` instead of `dns.lookup()`** when possible

3. **Monitor thread pool saturation** with async hooks or custom metrics

4. **Stream large files** instead of reading entirely

5. **Use worker threads** for CPU-intensive operations

6. **Cache DNS results** to reduce thread pool usage

7. **Consider async alternatives** (Redis, network services) over file I/O

## References

- libuv Thread Pool: http://docs.libuv.org/en/v1.x/threadpool.html
- libuv source: `deps/uv/src/threadpool.c` in Node.js source
- Node.js `dns` documentation for lookup vs resolve differences
