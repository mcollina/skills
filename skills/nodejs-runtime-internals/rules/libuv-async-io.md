---
name: libuv-async-io
description: libuv async I/O patterns, handles, requests
metadata:
  tags: libuv, async-io, handles, requests, epoll, kqueue, iocp
---

# libuv Async I/O

libuv provides cross-platform asynchronous I/O using the best available mechanism on each OS. Understanding these primitives helps debug I/O issues and write performant native addons.

## I/O Multiplexing

libuv uses different mechanisms per platform:

| Platform | Mechanism | Description |
|----------|-----------|-------------|
| Linux | epoll | Scalable I/O event notification |
| macOS/BSD | kqueue | Kernel event notification |
| Windows | IOCP | I/O Completion Ports |
| SunOS | event ports | Solaris event ports |

```c
// libuv abstracts these differences
// Node.js code works the same on all platforms
```

## Handles and Requests

libuv has two core abstractions:

### Handles

Long-lived objects representing resources:

```c
// Handle types (from uv.h)
typedef enum {
  UV_ASYNC,       // Async notification
  UV_CHECK,       // Check phase callbacks
  UV_FS_EVENT,    // File system events
  UV_FS_POLL,     // File system polling
  UV_HANDLE,      // Base handle type
  UV_IDLE,        // Idle phase callbacks
  UV_NAMED_PIPE,  // Named pipe handle
  UV_POLL,        // File descriptor polling
  UV_PREPARE,     // Prepare phase callbacks
  UV_PROCESS,     // Process handle
  UV_STREAM,      // Stream base type
  UV_TCP,         // TCP socket
  UV_TIMER,       // Timer
  UV_TTY,         // Terminal
  UV_UDP,         // UDP socket
  UV_SIGNAL,      // Signal handler
} uv_handle_type;
```

### Requests

Short-lived operations:

```c
// Request types
typedef enum {
  UV_REQ,         // Base request type
  UV_CONNECT,     // Connect request
  UV_WRITE,       // Write request
  UV_SHUTDOWN,    // Shutdown request
  UV_UDP_SEND,    // UDP send request
  UV_FS,          // File system request
  UV_WORK,        // Thread pool work
  UV_GETADDRINFO, // DNS lookup
  UV_GETNAMEINFO, // Reverse DNS lookup
} uv_req_type;
```

## TCP/UDP I/O

### TCP Server (JavaScript)

```javascript
const net = require('node:net');

const server = net.createServer((socket) => {
  // Each connection is a uv_tcp_t handle

  socket.on('data', (chunk) => {
    // Data arrives via uv_read_cb
    // Internally: uv_read_start() on the handle
  });

  socket.on('close', () => {
    // Handle is closed via uv_close()
  });
});

server.listen(3000);
// Creates uv_tcp_t, binds, and starts listening
```

### TCP Server (C/libuv)

```c
#include <uv.h>

uv_loop_t *loop;
uv_tcp_t server;

void on_new_connection(uv_stream_t *server, int status) {
  if (status < 0) return;

  uv_tcp_t *client = malloc(sizeof(uv_tcp_t));
  uv_tcp_init(loop, client);

  if (uv_accept(server, (uv_stream_t*) client) == 0) {
    uv_read_start((uv_stream_t*) client, alloc_buffer, on_read);
  } else {
    uv_close((uv_handle_t*) client, on_close);
  }
}

int main() {
  loop = uv_default_loop();

  uv_tcp_init(loop, &server);

  struct sockaddr_in addr;
  uv_ip4_addr("0.0.0.0", 3000, &addr);

  uv_tcp_bind(&server, (const struct sockaddr*)&addr, 0);
  uv_listen((uv_stream_t*) &server, 128, on_new_connection);

  return uv_run(loop, UV_RUN_DEFAULT);
}
```

### UDP (JavaScript)

```javascript
const dgram = require('node:dgram');

const socket = dgram.createSocket('udp4');
// Creates uv_udp_t handle

socket.on('message', (msg, rinfo) => {
  // uv_udp_recv_cb callback
});

socket.bind(41234);
// uv_udp_bind() + uv_udp_recv_start()

socket.send(Buffer.from('hello'), 41234, 'localhost');
// uv_udp_send() request
```

## File System I/O

File system operations use the thread pool, but the interface follows the same pattern:

```javascript
const fs = require('node:fs');

// Async operation using thread pool
fs.readFile('file.txt', (err, data) => {
  // Callback runs on main thread after worker completes
});

// Internally:
// 1. uv_fs_open() request queued to thread pool
// 2. Worker thread calls open(), read(), close()
// 3. Callback scheduled on main thread
```

### File Descriptor Operations

```javascript
const fs = require('node:fs');

// Open returns a file descriptor
fs.open('file.txt', 'r', (err, fd) => {
  // fd is an integer file descriptor

  // Read at specific position
  const buffer = Buffer.alloc(1024);
  fs.read(fd, buffer, 0, 1024, 0, (err, bytesRead) => {
    console.log(buffer.slice(0, bytesRead).toString());

    fs.close(fd, () => {});
  });
});
```

### File Watching

```javascript
const fs = require('node:fs');

// Uses OS-specific file watching (inotify, FSEvents, ReadDirectoryChangesW)
// NOT the thread pool
const watcher = fs.watch('file.txt', (eventType, filename) => {
  console.log(eventType, filename);
});

// Different from fs.watchFile which DOES poll (thread pool)
fs.watchFile('file.txt', { interval: 1000 }, (curr, prev) => {
  // Uses stat polling - thread pool
});
```

## Stream Backpressure

libuv handles backpressure at the stream level:

```javascript
const net = require('node:net');

const socket = net.connect(80, 'example.com');

socket.on('data', (chunk) => {
  // If processing is slow, pause reading
  socket.pause();

  processChunk(chunk, () => {
    // Resume when ready
    socket.resume();
  });
});
```

Internally:

```c
// socket.pause() -> uv_read_stop()
// socket.resume() -> uv_read_start()

// This controls whether epoll/kqueue watches for readable events
```

### Write Backpressure

```javascript
const net = require('node:net');

const socket = net.connect(80, 'example.com');

function writeData(data) {
  const canContinue = socket.write(data);

  if (!canContinue) {
    // Kernel buffer is full
    // Wait for 'drain' event
    socket.once('drain', () => {
      // Can write more now
    });
  }
}
```

## Poll Handle

For custom file descriptor polling:

```javascript
const { Poll } = process.binding('fs_event');
// Note: This is internal API, not recommended

// Better: Use native addon with uv_poll
```

```c
// Native addon: Poll arbitrary file descriptor
#include <uv.h>

uv_poll_t poll_handle;
int fd = /* some file descriptor */;

void on_poll(uv_poll_t* handle, int status, int events) {
  if (events & UV_READABLE) {
    // fd is readable
  }
  if (events & UV_WRITABLE) {
    // fd is writable
  }
}

uv_poll_init(loop, &poll_handle, fd);
uv_poll_start(&poll_handle, UV_READABLE | UV_WRITABLE, on_poll);
```

## Async Notification

For signaling between threads:

```c
#include <uv.h>

uv_async_t async;

// Called on main thread when async_send is called
void async_cb(uv_async_t* handle) {
  printf("Received async notification\n");
}

// Can be called from any thread
void worker_thread(void* arg) {
  // Do some work...
  uv_async_send(&async);  // Wake up main thread
}

int main() {
  uv_loop_t* loop = uv_default_loop();

  uv_async_init(loop, &async, async_cb);

  // Start worker thread...

  return uv_run(loop, UV_RUN_DEFAULT);
}
```

In JavaScript, this is used internally for:
- Worker thread communication
- N-API async callbacks
- Signal handlers

## Performance Considerations

### Connection Limits

```javascript
const os = require('node:os');

// Check max open files
const { rlimit } = process.binding('os');
console.log('Max open files:', rlimit('nofile'));

// Increase on Linux:
// ulimit -n 65536
```

### Socket Options

```javascript
const net = require('node:net');

const server = net.createServer();

server.on('connection', (socket) => {
  // Disable Nagle's algorithm for low latency
  socket.setNoDelay(true);

  // Enable keep-alive
  socket.setKeepAlive(true, 60000);

  // Set socket timeout
  socket.setTimeout(30000);
});

// Set TCP backlog (connection queue size)
server.listen(3000, '0.0.0.0', 511);  // 511 is default
```

### Buffer Allocation

```javascript
const net = require('node:net');

// Default allocator creates new buffers
// For high throughput, consider buffer pooling

const bufferPool = [];
const BUFFER_SIZE = 16384;

function allocBuffer() {
  return bufferPool.length > 0
    ? bufferPool.pop()
    : Buffer.allocUnsafe(BUFFER_SIZE);
}

function freeBuffer(buf) {
  if (buf.length === BUFFER_SIZE) {
    bufferPool.push(buf);
  }
}
```

## Debugging I/O

### strace/dtrace

```bash
# Linux: Trace system calls
strace -f -e trace=network node app.js

# macOS: DTrace
sudo dtrace -n 'syscall::read:return /pid == $target/ { printf("%d bytes", arg1); }' -p $(pgrep node)
```

### libuv Debugging

```bash
# Enable libuv debug logging
UV_DEBUG=1 node app.js

# Trace handles at exit
node --trace-exit app.js
```

### Active Handles

```javascript
// Check active handles (what's keeping process alive)
const handles = process._getActiveHandles();
const requests = process._getActiveRequests();

console.log('Active handles:', handles.length);
handles.forEach(h => console.log(' ', h.constructor.name));

console.log('Active requests:', requests.length);
requests.forEach(r => console.log(' ', r.constructor.name));
```

## Common Patterns

### Graceful Socket Shutdown

```javascript
const net = require('node:net');

function gracefulClose(socket) {
  // Disable reading (half-close)
  socket.end();

  // Set timeout for close
  const timeout = setTimeout(() => {
    socket.destroy();
  }, 5000);

  socket.once('close', () => {
    clearTimeout(timeout);
  });
}
```

### Connection Draining

```javascript
const http = require('node:http');

const server = http.createServer((req, res) => {
  res.end('Hello');
});

const connections = new Set();

server.on('connection', (socket) => {
  connections.add(socket);
  socket.on('close', () => connections.delete(socket));
});

function shutdown() {
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Destroy idle connections
  for (const socket of connections) {
    socket.end();
  }

  // Force close after timeout
  setTimeout(() => {
    for (const socket of connections) {
      socket.destroy();
    }
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
```

## Native Addon I/O

When writing native addons that do I/O:

```cpp
#include <napi.h>
#include <uv.h>

// For sockets, integrate with libuv's poll:
class SocketWrapper : public Napi::ObjectWrap<SocketWrapper> {
  uv_poll_t poll_handle_;
  int fd_;
  Napi::ThreadSafeFunction on_readable_;

public:
  void StartPolling() {
    uv_poll_init(uv_default_loop(), &poll_handle_, fd_);
    poll_handle_.data = this;
    uv_poll_start(&poll_handle_, UV_READABLE, OnPoll);
  }

  static void OnPoll(uv_poll_t* handle, int status, int events) {
    auto* self = static_cast<SocketWrapper*>(handle->data);
    if (events & UV_READABLE) {
      self->on_readable_.NonBlockingCall();
    }
  }
};
```

## References

- libuv documentation: http://docs.libuv.org/
- libuv Design Overview: http://docs.libuv.org/en/v1.x/design.html
- Node.js source: `deps/uv/src/unix/` and `deps/uv/src/win/`
