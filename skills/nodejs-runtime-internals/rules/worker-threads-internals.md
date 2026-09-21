---
name: worker-threads-internals
description: SharedArrayBuffer, Atomics, MessageChannel internals
metadata:
  tags: worker-threads, shared-memory, atomics, message-channel, parallelism
---

# Node.js Worker Threads Internals

Worker threads enable true parallelism in Node.js by running JavaScript in separate V8 isolates. Understanding the internals helps build efficient parallel applications.

## Architecture

```
Main Thread
├── Main V8 Isolate
├── Main Event Loop (libuv)
└── MessagePort connections
        │
        ▼
Worker Thread 1          Worker Thread 2
├── Worker V8 Isolate    ├── Worker V8 Isolate
├── Worker Event Loop    ├── Worker Event Loop
└── MessagePort          └── MessagePort
        │                        │
        └────────────────────────┘
                    │
                    ▼
          SharedArrayBuffer (shared memory)
```

## Worker Creation

### JavaScript Layer

```javascript
// lib/internal/worker.js (simplified)

const { Worker: WorkerImpl } = internalBinding('worker');

class Worker extends EventEmitter {
  constructor(filename, options = {}) {
    super();

    // Create C++ Worker object
    this[kHandle] = new WorkerImpl(
      filename,
      options.env,
      options.execArgv,
      options.resourceLimits,
      options.trackUnmanagedFds
    );

    // Set up message channel
    const { port1, port2 } = new MessageChannel();
    this[kPublicPort] = port1;
    this[kHandle].startThread(port2);

    // Forward messages
    port1.on('message', (msg) => this.emit('message', msg));
  }

  postMessage(value, transferList) {
    this[kPublicPort].postMessage(value, transferList);
  }

  terminate() {
    return this[kHandle].terminate();
  }
}
```

### C++ Implementation

```cpp
// From src/node_worker.cc

void Worker::StartThread(const FunctionCallbackInfo<Value>& args) {
  Worker* w;
  ASSIGN_OR_RETURN_UNWRAP(&w, args.This());

  // Get message port
  MessagePort* port;
  ASSIGN_OR_RETURN_UNWRAP(&port, args[0].As<Object>());
  w->parent_port_.Reset(w->env()->isolate(), args[0].As<Object>());

  // Create new thread
  int ret = uv_thread_create(&w->tid_, [](void* arg) {
    Worker* w = static_cast<Worker*>(arg);
    w->Run();
  }, w);

  if (ret != 0) {
    ThrowException(w->env()->isolate(),
                   String::NewFromUtf8(w->env()->isolate(),
                                       "Could not create worker thread"));
  }
}

void Worker::Run() {
  // Create new V8 isolate for worker
  Isolate::CreateParams params;
  params.array_buffer_allocator = allocator_.get();

  Isolate* isolate = Isolate::New(params);

  {
    Locker locker(isolate);
    Isolate::Scope isolate_scope(isolate);
    HandleScope handle_scope(isolate);

    // Create new Environment for worker
    Environment* env = CreateEnvironment(...);

    // Run the worker script
    env->RunBootstrapping();
    ExecuteWorkerScript(env);

    // Run event loop
    uv_run(&loop_, UV_RUN_DEFAULT);
  }

  isolate->Dispose();
}
```

## MessageChannel and MessagePort

### Structured Clone Algorithm

```javascript
// Messages are serialized using structured clone
const { MessageChannel } = require('worker_threads');

const { port1, port2 } = new MessageChannel();

// Supported types:
port1.postMessage({
  number: 42,
  string: 'hello',
  date: new Date(),
  regexp: /pattern/g,
  array: [1, 2, 3],
  map: new Map([['key', 'value']]),
  set: new Set([1, 2, 3]),
  buffer: Buffer.from('data'),
  typedArray: new Float64Array([1.1, 2.2]),
  arrayBuffer: new ArrayBuffer(8),
  error: new Error('message'),
  // NOT supported: functions, symbols, WeakMap, WeakSet
});
```

### Transfer List

```javascript
// Transfer ownership instead of copying
const buffer = new ArrayBuffer(1024 * 1024);  // 1MB

// Without transfer: copies entire buffer
port.postMessage({ buffer });

// With transfer: moves buffer (zero-copy)
port.postMessage({ buffer }, [buffer]);
// buffer is now detached (unusable) in sender
```

### C++ Message Passing

```cpp
// From src/node_messaging.cc

void MessagePort::PostMessage(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  MessagePort* port;
  ASSIGN_OR_RETURN_UNWRAP(&port, args.This());

  Local<Value> message = args[0];
  Local<Value> transfer_list = args[1];

  // Serialize message
  std::shared_ptr<Message> msg = std::make_shared<Message>();

  ValueSerializer serializer(env->isolate(), msg->serializer_delegate());
  serializer.WriteValue(env->context(), message);

  // Handle transfer list
  if (!transfer_list->IsUndefined()) {
    Local<Array> transfers = transfer_list.As<Array>();
    for (uint32_t i = 0; i < transfers->Length(); i++) {
      Local<Value> entry = transfers->Get(env->context(), i).ToLocalChecked();
      // Transfer ArrayBuffer, MessagePort, etc.
    }
  }

  // Send to target port
  port->data_->AddToIncomingQueue(std::move(msg));
}
```

## SharedArrayBuffer

### Creating Shared Memory

```javascript
// Main thread
const { Worker } = require('worker_threads');

// Create shared memory
const sharedBuffer = new SharedArrayBuffer(1024);
const sharedArray = new Int32Array(sharedBuffer);

const worker = new Worker('./worker.js', {
  workerData: { sharedBuffer }
});

// Both threads can now access sharedArray
sharedArray[0] = 42;
```

```javascript
// worker.js
const { workerData } = require('worker_threads');

const sharedArray = new Int32Array(workerData.sharedBuffer);
console.log(sharedArray[0]);  // 42
sharedArray[1] = 100;  // Visible to main thread
```

### Memory Layout

```
SharedArrayBuffer
+------------------+------------------+------------------+
| Index 0          | Index 1          | Index 2          | ...
| (Int32: 4 bytes) | (Int32: 4 bytes) | (Int32: 4 bytes) |
+------------------+------------------+------------------+
      ↑                    ↑
      |                    |
  Main Thread          Worker Thread
  sharedArray[0]       sharedArray[1]
```

## Atomics

### Atomic Operations

```javascript
const shared = new Int32Array(new SharedArrayBuffer(4));

// Atomic operations are thread-safe
Atomics.add(shared, 0, 1);      // Atomic increment
Atomics.sub(shared, 0, 1);      // Atomic decrement
Atomics.exchange(shared, 0, 5); // Atomic swap, returns old value
Atomics.compareExchange(shared, 0, 5, 10);  // CAS

// Load and store
Atomics.load(shared, 0);        // Atomic read
Atomics.store(shared, 0, 42);   // Atomic write
```

### Wait and Notify (Futex)

```javascript
// Worker: Wait for value to change
const result = Atomics.wait(shared, 0, 0);
// result: 'ok', 'timed-out', or 'not-equal'

// Main: Wake waiting workers
Atomics.store(shared, 0, 1);
Atomics.notify(shared, 0, 1);  // Wake 1 worker
```

### Spinlock Implementation

```javascript
class Spinlock {
  constructor(sharedBuffer, index = 0) {
    this.lock = new Int32Array(sharedBuffer, index * 4, 1);
  }

  acquire() {
    while (Atomics.compareExchange(this.lock, 0, 0, 1) !== 0) {
      // Spin until lock acquired
    }
  }

  release() {
    Atomics.store(this.lock, 0, 0);
  }
}
```

### Mutex with Wait/Notify

```javascript
class Mutex {
  constructor(sharedBuffer, index = 0) {
    this.state = new Int32Array(sharedBuffer, index * 4, 1);
  }

  lock() {
    while (true) {
      // Try to acquire (0 -> 1)
      if (Atomics.compareExchange(this.state, 0, 0, 1) === 0) {
        return;  // Acquired
      }

      // Wait until state might be 0
      Atomics.wait(this.state, 0, 1);
    }
  }

  unlock() {
    Atomics.store(this.state, 0, 0);
    Atomics.notify(this.state, 0, 1);
  }
}
```

## Worker Data

### Passing Initial Data

```javascript
// Main thread
const worker = new Worker('./worker.js', {
  workerData: {
    config: { port: 8080 },
    sharedBuffer: new SharedArrayBuffer(1024)
  }
});

// Worker
const { workerData } = require('worker_threads');
console.log(workerData.config);  // { port: 8080 }
```

### Resource Limits

```javascript
const worker = new Worker('./worker.js', {
  resourceLimits: {
    maxOldGenerationSizeMb: 128,    // V8 old space limit
    maxYoungGenerationSizeMb: 32,   // V8 young space limit
    codeRangeSizeMb: 32,            // V8 code space limit
    stackSizeMb: 4                  // Stack size
  }
});
```

## Thread Communication Patterns

### Request-Response

```javascript
// Main thread
const pending = new Map();
let messageId = 0;

worker.on('message', ({ id, result, error }) => {
  const { resolve, reject } = pending.get(id);
  pending.delete(id);
  if (error) reject(new Error(error));
  else resolve(result);
});

function callWorker(method, args) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}
```

### Producer-Consumer Queue

```javascript
class SharedQueue {
  constructor(size) {
    // Layout: [head, tail, ...items]
    this.buffer = new SharedArrayBuffer((size + 2) * 4);
    this.meta = new Int32Array(this.buffer, 0, 2);
    this.items = new Int32Array(this.buffer, 8, size);
    this.size = size;
  }

  push(value) {
    const tail = Atomics.load(this.meta, 1);
    const newTail = (tail + 1) % this.size;
    const head = Atomics.load(this.meta, 0);

    if (newTail === head) {
      return false;  // Queue full
    }

    this.items[tail] = value;
    Atomics.store(this.meta, 1, newTail);
    Atomics.notify(this.meta, 1, 1);  // Wake consumers
    return true;
  }

  pop() {
    while (true) {
      const head = Atomics.load(this.meta, 0);
      const tail = Atomics.load(this.meta, 1);

      if (head === tail) {
        // Queue empty, wait
        Atomics.wait(this.meta, 1, tail);
        continue;
      }

      const value = this.items[head];
      const newHead = (head + 1) % this.size;
      Atomics.store(this.meta, 0, newHead);
      return value;
    }
  }
}
```

## Performance Considerations

### Message Passing Overhead

```javascript
// BAD: Many small messages
for (const item of items) {
  worker.postMessage(item);
}

// GOOD: Batch messages
worker.postMessage(items);

// BEST: Shared memory for frequent updates
const shared = new Float64Array(new SharedArrayBuffer(items.length * 8));
items.forEach((v, i) => shared[i] = v);
worker.postMessage({ ready: true });
```

### Avoid Cloning Large Objects

```javascript
// BAD: Clones entire buffer
const buffer = Buffer.alloc(10 * 1024 * 1024);
worker.postMessage({ buffer });

// GOOD: Transfer ownership
const ab = new ArrayBuffer(10 * 1024 * 1024);
worker.postMessage({ buffer: ab }, [ab]);

// BEST: Use SharedArrayBuffer
const shared = new SharedArrayBuffer(10 * 1024 * 1024);
worker.postMessage({ buffer: shared });
```

### Worker Pool

```javascript
const { Worker } = require('worker_threads');

class WorkerPool {
  constructor(script, size = 4) {
    this.workers = [];
    this.free = [];
    this.queue = [];

    for (let i = 0; i < size; i++) {
      const worker = new Worker(script);
      worker.on('message', (result) => {
        const task = worker.currentTask;
        worker.currentTask = null;
        task.resolve(result);
        this.free.push(worker);
        this.dispatch();
      });
      worker.on('error', (err) => {
        const task = worker.currentTask;
        if (task) {
          task.reject(err);
        }
      });
      this.workers.push(worker);
      this.free.push(worker);
    }
  }

  run(data) {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this.dispatch();
    });
  }

  dispatch() {
    while (this.queue.length > 0 && this.free.length > 0) {
      const worker = this.free.pop();
      const task = this.queue.shift();
      worker.currentTask = task;
      worker.postMessage(task.data);
    }
  }

  terminate() {
    return Promise.all(this.workers.map(w => w.terminate()));
  }
}
```

## Debugging

### Worker State

```javascript
const { Worker, threadId, isMainThread } = require('worker_threads');

console.log('Thread ID:', threadId);
console.log('Is main thread:', isMainThread);

// In worker
const { parentPort } = require('worker_threads');
if (parentPort) {
  console.log('Running as worker');
}
```

### Terminate Handling

```javascript
const worker = new Worker(script);

worker.on('exit', (code) => {
  console.log(`Worker exited with code ${code}`);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.terminate();
  process.exit(0);
});
```

## Common Issues

### Memory Leaks

```javascript
// BAD: Growing message queue
setInterval(() => {
  worker.postMessage(data);  // If worker is slow, messages queue up
}, 1);

// GOOD: Flow control
let pending = 0;
const MAX_PENDING = 100;

worker.on('message', () => pending--);

function sendIfRoom(data) {
  if (pending < MAX_PENDING) {
    pending++;
    worker.postMessage(data);
  }
}
```

### Deadlock with Atomics.wait

```javascript
// BAD: Main thread waiting
Atomics.wait(shared, 0, 0);  // Never use on main thread!

// GOOD: Only workers should wait
// Main thread uses Atomics.waitAsync (or don't wait at all)
if (!isMainThread) {
  Atomics.wait(shared, 0, 0);
}
```

## References

- Node.js worker_threads: `lib/worker_threads.js`
- Internal implementation: `lib/internal/worker.js`
- C++ bindings: `src/node_worker.cc`, `src/node_messaging.cc`
- SharedArrayBuffer: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
