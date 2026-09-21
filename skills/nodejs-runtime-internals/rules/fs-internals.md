---
name: fs-internals
description: libuv fs operations, sync vs async, internal implementation
metadata:
  tags: fs, filesystem, libuv, async, sync, internals
---

# Node.js File System Internals

Understanding how the `fs` module works internally helps optimize file operations and avoid common pitfalls.

## Architecture

```
JavaScript Layer (lib/fs.js)
├── fs.readFile()
├── fs.writeFile()
├── fs.stat()
└── fs.promises.*
        │
        ▼
C++ Bindings (src/node_file.cc)
├── FSReqCallback
├── FSReqPromise
└── FSReqAfterScope
        │
        ▼
libuv Thread Pool
├── uv_fs_open()
├── uv_fs_read()
├── uv_fs_write()
└── uv_fs_stat()
        │
        ▼
System Calls
├── open(), read(), write()
├── stat(), lstat(), fstat()
└── mkdir(), rmdir(), unlink()
```

## Async vs Sync Operations

### Async (Thread Pool)

```javascript
// Async: Uses thread pool, doesn't block event loop
const fs = require('node:fs');

fs.readFile('/path/to/file', (err, data) => {
  // Callback runs on main thread after file is read
});
```

Internal flow:

```
1. JavaScript: fs.readFile()
   ↓
2. C++: FSReqCallback created
   ↓
3. libuv: uv_fs_open() queued to thread pool
   ↓
4. Worker thread: open() system call
   ↓
5. libuv: uv_fs_read() queued
   ↓
6. Worker thread: read() system call
   ↓
7. libuv: Work complete, schedule callback
   ↓
8. Main thread: AfterRead() → JavaScript callback
```

### Sync (Blocks Event Loop)

```javascript
// Sync: Blocks main thread entirely
const data = fs.readFileSync('/path/to/file');
// Nothing else can happen until file is read
```

Internal flow:

```
1. JavaScript: fs.readFileSync()
   ↓
2. C++: uv_fs_open() called synchronously
   ↓
3. Main thread: Blocks on open() system call
   ↓
4. C++: uv_fs_read() called synchronously
   ↓
5. Main thread: Blocks on read() system call
   ↓
6. JavaScript: Returns data
```

## C++ Implementation

### FSReqCallback

```cpp
// From src/node_file.cc

void Open(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  const int argc = args.Length();
  node::Utf8Value path(env->isolate(), args[0]);
  int flags = args[1].As<Int32>()->Value();
  int mode = args[2].As<Int32>()->Value();

  FSReqBase* req_wrap_async = GetReqWrap(env, args[3]);
  if (req_wrap_async != nullptr) {
    // Async path
    AsyncCall(env, req_wrap_async, args, "open", UTF8, AfterInteger,
              uv_fs_open, *path, flags, mode);
  } else {
    // Sync path
    FSReqWrapSync req_wrap_sync;
    SyncCall(env, args[4], &req_wrap_sync, "open",
             uv_fs_open, *path, flags, mode);
  }
}

// Async completion
void FSReqCallback::AfterInteger(uv_fs_t* req) {
  FSReqCallback* req_wrap = FSReqCallback::from_req(req);
  Environment* env = req_wrap->env();
  HandleScope handle_scope(env->isolate());

  int result = req->result;
  req_wrap->Resolve(Integer::New(env->isolate(), result));
}
```

### FSReqPromise

```cpp
// Promise-based API uses FSReqPromise
// From src/node_file.cc

void BindingData::FileHandle::Read(
    const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  FileHandle* handle;
  ASSIGN_OR_RETURN_UNWRAP(&handle, args.This());

  // Get buffer info
  Local<Object> buffer = args[0].As<Object>();
  char* data = Buffer::Data(buffer);
  size_t length = Buffer::Length(buffer);
  int64_t offset = args[1].As<Integer>()->Value();

  FSReqBase* req_wrap = GetReqWrap(env, args[4]);

  // Use promise if no callback
  if (req_wrap == nullptr) {
    req_wrap = FSReqPromise<AliasedFloat64Array>::New(env, true);
  }

  uv_buf_t buf = uv_buf_init(data, length);
  int err = uv_fs_read(
      env->event_loop(),
      req_wrap->req(),
      handle->fd_,
      &buf,
      1,
      offset,
      AfterRead);

  if (err < 0) {
    req_wrap->Reject(UVException(env->isolate(), err, "read"));
  }
}
```

## File Descriptors

### Opening Files

```javascript
const fs = require('node:fs');

// Open returns a file descriptor (integer)
fs.open('/path/to/file', 'r', (err, fd) => {
  console.log(fd);  // e.g., 3

  // Use fd for operations
  const buffer = Buffer.alloc(1024);
  fs.read(fd, buffer, 0, 1024, 0, (err, bytesRead) => {
    console.log(bytesRead);
  });

  // MUST close to prevent leak
  fs.close(fd, () => {});
});
```

### FileHandle (Promise API)

```javascript
const fs = require('node:fs/promises');

async function readFile(path) {
  const handle = await fs.open(path, 'r');
  try {
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buffer, 0, 1024, 0);
    return buffer.slice(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// Or use the file for streaming
async function streamFile(path) {
  const handle = await fs.open(path, 'r');
  const stream = handle.createReadStream();
  // Stream handles closing when done
}
```

### File Descriptor Limits

```javascript
const os = require('node:os');

// Get current limits (Linux/macOS)
const { rlimit } = process.binding('os');
console.log('Max open files:', rlimit('nofile'));

// Check current count
const handles = process._getActiveHandles();
const files = handles.filter(h =>
  h.constructor.name === 'FSReqCallback' ||
  h.fd !== undefined
);
console.log('Open file handles:', files.length);
```

## Buffered Operations

### readFile/writeFile

These buffer the entire file in memory:

```cpp
// From src/node_file.cc

// readFile reads chunks and concatenates
void FSReqCallback::AfterReadFile(uv_fs_t* req) {
  FSReqCallback* req_wrap = FSReqCallback::from_req(req);

  // ... accumulate chunks into buffer

  if (req->result >= 0) {
    // Create result buffer
    Local<Value> buffer = Buffer::Copy(env, data, size).ToLocalChecked();
    req_wrap->Resolve(buffer);
  }
}
```

### When to Use Streams Instead

```javascript
// BAD: Large file into memory
const data = await fs.promises.readFile('huge-file.log');

// GOOD: Stream for large files
const stream = fs.createReadStream('huge-file.log');
for await (const chunk of stream) {
  processChunk(chunk);
}
```

## Watch Implementation

### fs.watch (inotify/FSEvents/ReadDirectoryChangesW)

```javascript
// Uses OS-specific file watching
const watcher = fs.watch('/path/to/dir', (eventType, filename) => {
  console.log(eventType, filename);
});
```

```cpp
// From src/fs_event_wrap.cc

void FSEventWrap::Start(const FunctionCallbackInfo<Value>& args) {
  FSEventWrap* wrap;
  ASSIGN_OR_RETURN_UNWRAP(&wrap, args.This());

  node::Utf8Value path(env->isolate(), args[0]);

  // Platform-specific: inotify (Linux), FSEvents (macOS),
  // ReadDirectoryChangesW (Windows)
  int err = uv_fs_event_start(&wrap->handle_, OnEvent, *path, 0);

  args.GetReturnValue().Set(err);
}
```

### fs.watchFile (Polling)

```javascript
// Uses stat polling - thread pool for each check
fs.watchFile('/path/to/file', { interval: 1000 }, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    console.log('File changed');
  }
});
```

**Recommendation**: Prefer `fs.watch()` over `fs.watchFile()` for performance.

## Performance Optimization

### Read Operations

```javascript
// 1. Use appropriate buffer size
const OPTIMAL_BUFFER_SIZE = 64 * 1024;  // 64KB
const buffer = Buffer.allocUnsafe(OPTIMAL_BUFFER_SIZE);

// 2. Reuse buffers
const sharedBuffer = Buffer.allocUnsafe(65536);

async function readChunk(fd, position) {
  const { bytesRead } = await fs.read(fd, sharedBuffer, 0, sharedBuffer.length, position);
  return sharedBuffer.slice(0, bytesRead);
}

// 3. Use streaming for sequential access
const stream = fs.createReadStream(path, {
  highWaterMark: 64 * 1024  // Buffer size
});
```

### Write Operations

```javascript
// 1. Batch writes
const chunks = [];
for (const item of items) {
  chunks.push(serialize(item));
}
await fs.promises.writeFile(path, chunks.join('\n'));

// 2. Use streams for continuous writes
const stream = fs.createWriteStream(path);
for (const item of items) {
  if (!stream.write(serialize(item))) {
    await once(stream, 'drain');
  }
}

// 3. Use appendFile for logs
await fs.promises.appendFile('app.log', logLine);
```

### Directory Operations

```javascript
// Efficient directory reading
const entries = await fs.promises.readdir(dir, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isDirectory()) {
    // entry.name is just the name, not full path
    await processDir(path.join(dir, entry.name));
  }
}
```

## Common Issues

### EMFILE (Too Many Open Files)

```javascript
// BAD: Opening too many files at once
const files = await getFiles();  // 10000 files
const contents = await Promise.all(
  files.map(f => fs.promises.readFile(f))
);  // EMFILE!

// GOOD: Limit concurrency
import pLimit from 'p-limit';
const limit = pLimit(100);

const contents = await Promise.all(
  files.map(f => limit(() => fs.promises.readFile(f)))
);
```

### File Descriptor Leaks

```javascript
// BAD: Leak on error
const fd = await fs.promises.open(path, 'r');
const data = await processFile(fd);  // If this throws, fd leaks!
await fd.close();

// GOOD: Use finally
const fd = await fs.promises.open(path, 'r');
try {
  return await processFile(fd);
} finally {
  await fd.close();
}

// BETTER: Use streams which handle cleanup
const stream = fs.createReadStream(path);
stream.on('error', () => {});  // Stream auto-closes on error
```

### Race Conditions

```javascript
// BAD: Check-then-use race
if (await fs.promises.exists(path)) {
  await fs.promises.readFile(path);  // May fail!
}

// GOOD: Just try the operation
try {
  return await fs.promises.readFile(path);
} catch (err) {
  if (err.code === 'ENOENT') {
    return null;  // File doesn't exist
  }
  throw err;
}
```

## Debugging

### Tracing FS Operations

```bash
# Linux: strace
strace -e trace=file node app.js

# macOS: dtruss
sudo dtruss -f node app.js

# Node.js trace
NODE_DEBUG=fs node app.js
```

### Monitoring Thread Pool

```javascript
const async_hooks = require('node:async_hooks');

const fsOps = new Map();

const hook = async_hooks.createHook({
  init(asyncId, type) {
    if (type === 'FSREQCALLBACK') {
      fsOps.set(asyncId, {
        start: Date.now(),
        type
      });
    }
  },
  destroy(asyncId) {
    const op = fsOps.get(asyncId);
    if (op) {
      const duration = Date.now() - op.start;
      if (duration > 100) {
        console.log(`Slow FS op: ${duration}ms`);
      }
      fsOps.delete(asyncId);
    }
  }
});

hook.enable();
```

## References

- Node.js fs source: `lib/fs.js`, `lib/internal/fs/`
- C++ implementation: `src/node_file.cc`, `src/node_file.h`
- libuv fs: `deps/uv/src/fs.c`
