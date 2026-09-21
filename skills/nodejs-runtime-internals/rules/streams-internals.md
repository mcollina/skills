---
name: streams-internals
description: How Node.js streams work at C++ level
metadata:
  tags: streams, internals, readable, writable, duplex, transform, cpp
---

# Node.js Streams Internals

Understanding how streams work at the C++ level helps debug complex streaming issues and optimize high-throughput applications.

## Stream Architecture

```
JavaScript Layer
├── Readable (lib/internal/streams/readable.js)
├── Writable (lib/internal/streams/writable.js)
├── Duplex   (lib/internal/streams/duplex.js)
└── Transform (lib/internal/streams/transform.js)
        │
        ▼
C++ Bindings
├── StreamBase (src/stream_base.h)
├── StreamReq  (src/stream_base.h)
└── JSStream   (src/js_stream.h)
        │
        ▼
libuv Streams
├── uv_stream_t (deps/uv/include/uv.h)
├── uv_tcp_t
├── uv_pipe_t
└── uv_tty_t
```

## C++ StreamBase

The `StreamBase` class is the foundation for all stream types:

```cpp
// From src/stream_base.h

class StreamBase : public StreamResource {
 public:
  // Reading
  virtual int ReadStart() = 0;
  virtual int ReadStop() = 0;

  // Writing
  virtual int DoWrite(WriteWrap* w,
                      uv_buf_t* bufs,
                      size_t count,
                      uv_stream_t* send_handle) = 0;

  // Shutdown
  virtual int DoShutdown(ShutdownWrap* req) = 0;

  // Properties
  virtual bool IsAlive() = 0;
  virtual bool IsClosing() = 0;
  virtual bool IsIPCPipe();
  virtual int GetFD();
};
```

### StreamReq

Write and shutdown operations use requests:

```cpp
// From src/stream_base.h

class WriteWrap : public ReqWrap<uv_write_t> {
 public:
  // Called when write completes
  void OnDone(int status);

  // Storage for data being written
  char* storage_;
  size_t storage_size_;
};

class ShutdownWrap : public ReqWrap<uv_shutdown_t> {
 public:
  void OnDone(int status);
};
```

## Readable Stream Internals

### JavaScript Implementation

```javascript
// lib/internal/streams/readable.js (simplified)

class Readable extends Stream {
  constructor(options) {
    this._readableState = new ReadableState(options, this);
  }

  read(n) {
    const state = this._readableState;

    // Trigger _read if buffer is below high water mark
    if (state.length < state.highWaterMark) {
      this._read(state.highWaterMark);
    }

    // Return data from buffer
    return state.buffer.shift();
  }

  push(chunk) {
    const state = this._readableState;

    // Add to buffer
    state.buffer.push(chunk);
    state.length += chunk.length;

    // Emit 'readable' if listener exists
    if (state.needReadable) {
      emitReadable(this);
    }

    // Return false if buffer is full (backpressure)
    return state.length < state.highWaterMark;
  }
}
```

### C++ Read Implementation (TCP)

```cpp
// From src/tcp_wrap.cc

void TCPWrap::OnRead(ssize_t nread,
                     const uv_buf_t* buf,
                     uv_handle_type pending) {
  HandleScope scope(env()->isolate());
  Context::Scope context_scope(env()->context());

  if (nread < 0) {
    // Error or EOF
    if (nread == UV_EOF) {
      // Push null to signal end
      stream()->EmitRead(UV_EOF, uv_buf_init(nullptr, 0));
    } else {
      // Error
      stream()->EmitRead(nread);
    }
    return;
  }

  if (nread > 0) {
    // Create Buffer and emit to JS
    Local<Object> buffer = Buffer::New(env(), buf->base, nread).ToLocalChecked();
    stream()->CallJSOnreadMethod(nread, buffer);
  }
}
```

### Read Flow

```
1. JavaScript: stream.read()
   ↓
2. JavaScript: stream._read(n) [user implements]
   ↓
3. C++: ReadStart() → uv_read_start()
   ↓
4. libuv: epoll_wait/kqueue/IOCP
   ↓
5. libuv: alloc_cb → provide buffer
   ↓
6. libuv: read_cb with data
   ↓
7. C++: OnRead() → create Buffer
   ↓
8. JavaScript: push(chunk)
   ↓
9. JavaScript: 'data' or 'readable' event
```

## Writable Stream Internals

### JavaScript Implementation

```javascript
// lib/internal/streams/writable.js (simplified)

class Writable extends Stream {
  constructor(options) {
    this._writableState = new WritableState(options, this);
  }

  write(chunk, encoding, callback) {
    const state = this._writableState;

    // Add to buffer or write directly
    if (state.writing) {
      state.buffer.push({ chunk, encoding, callback });
    } else {
      doWrite(this, state, chunk, encoding, callback);
    }

    // Return false if buffer full (backpressure signal)
    return state.length < state.highWaterMark;
  }

  end(chunk, encoding, callback) {
    const state = this._writableState;

    if (chunk) {
      this.write(chunk, encoding);
    }

    state.ending = true;
    finishMaybe(this, state);
  }
}
```

### C++ Write Implementation

```cpp
// From src/stream_base.cc

int StreamBase::WriteString(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  // Get string from argument
  Local<String> string = args[0].As<String>();

  // Create write request
  WriteWrap* req_wrap = CreateWriteWrap(env);

  // Allocate buffer and encode string
  char* data = new char[string->Utf8Length(env->isolate())];
  string->WriteUtf8(env->isolate(), data);

  // Queue write
  uv_buf_t buf = uv_buf_init(data, length);
  int err = DoWrite(req_wrap, &buf, 1, nullptr);

  return err;
}
```

### Write Flow

```
1. JavaScript: stream.write(chunk)
   ↓
2. JavaScript: _write(chunk, encoding, callback) [user implements]
   ↓
3. C++: WriteString() or WriteBuffer()
   ↓
4. C++: DoWrite() → uv_write()
   ↓
5. libuv: Queue write request
   ↓
6. libuv: write_cb when complete
   ↓
7. C++: WriteWrap::OnDone()
   ↓
8. JavaScript: afterWrite() → callback()
   ↓
9. JavaScript: 'drain' event if buffer was full
```

## Backpressure Mechanism

### High Water Mark

```javascript
// lib/internal/streams/state.js

function getHighWaterMark(state, options, duplexKey, isDuplex) {
  const hwm = options.highWaterMark;

  if (hwm != null) {
    if (!Number.isInteger(hwm) || hwm < 0) {
      throw new ERR_INVALID_OPT_VALUE('highWaterMark', hwm);
    }
    return hwm;
  }

  if (isDuplex) {
    const duplexHwm = options[duplexKey];
    if (duplexHwm != null) {
      return duplexHwm;
    }
  }

  // Default: 16KB for normal streams, 16 objects for object mode
  return state.objectMode ? 16 : 16 * 1024;
}
```

### Backpressure in C++

```cpp
// From src/stream_wrap.cc

// uv_write callback
void StreamWrap::OnAfterWrite(WriteWrap* req_wrap, int status) {
  // Notify JavaScript
  Local<Value> argv[] = {
    Integer::New(env()->isolate(), status),
    req_wrap->object()
  };

  // This triggers 'drain' if needed
  req_wrap->callback().As<Function>()->Call(
    env()->context(),
    object(),
    arraysize(argv),
    argv
  );
}
```

## Duplex Streams

Duplex streams combine Readable and Writable:

```javascript
// lib/internal/streams/duplex.js

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  // Allow half-open
  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) {
    this.allowHalfOpen = false;
  }
}

ObjectSetPrototypeOf(Duplex.prototype, Readable.prototype);
ObjectSetPrototypeOf(Duplex, Readable);

// Copy Writable methods
const keys = ObjectKeys(Writable.prototype);
for (let i = 0; i < keys.length; i++) {
  const method = keys[i];
  if (!Duplex.prototype[method]) {
    Duplex.prototype[method] = Writable.prototype[method];
  }
}
```

## Transform Streams

Transform streams modify data in transit:

```javascript
// lib/internal/streams/transform.js

class Transform extends Duplex {
  constructor(options) {
    super(options);
    this._transformState = new TransformState(options, this);
  }

  _read(n) {
    const ts = this._transformState;

    if (ts.writechunk !== null && !ts.transforming) {
      ts.transforming = true;
      this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
    } else {
      ts.needTransform = true;
    }
  }

  _write(chunk, encoding, callback) {
    const ts = this._transformState;
    ts.writechunk = chunk;
    ts.writeencoding = encoding;
    ts.writecb = callback;

    if (!ts.transforming) {
      this._read();
    }
  }
}
```

## Pipeline Implementation

```javascript
// lib/internal/streams/pipeline.js (simplified)

function pipeline(...streams) {
  const callback = streams.pop();

  if (!streams.length) {
    throw new ERR_MISSING_ARGS('streams');
  }

  let error;
  const destroys = streams.map((stream, i) => {
    const isLast = i === streams.length - 1;

    return destroyer(stream, !isLast, isLast, (err) => {
      if (!error) error = err;
      if (err) {
        destroys.forEach(d => d());
      }
      if (isLast) {
        callback(error);
      }
    });
  });

  // Connect streams with pipe
  for (let i = 0; i < streams.length - 1; i++) {
    streams[i].pipe(streams[i + 1]);
  }
}

function destroyer(stream, reading, writing, callback) {
  let closed = false;

  stream.on('close', () => {
    closed = true;
  });

  stream.on('error', callback);

  if (reading) {
    stream.on('end', () => {
      if (!closed) callback();
    });
  }

  if (writing) {
    stream.on('finish', () => {
      if (!closed) callback();
    });
  }

  return () => {
    stream.destroy();
  };
}
```

## Performance Optimization

### Buffer Pooling in C++

```cpp
// Node.js uses a slab allocator for read buffers
// From src/stream_wrap.cc

void StreamWrap::OnAlloc(size_t suggested_size, uv_buf_t* buf) {
  // Use slab allocator for better performance
  *buf = env()->allocate_managed_buffer(suggested_size);
}
```

### Avoiding Copies

```cpp
// Zero-copy Buffer creation
Local<Object> StreamBase::CreateBufferFromExisting(
    char* data, size_t length) {
  // Transfer ownership to JavaScript
  return Buffer::New(env(), data, length,
                     [](char* data, void* hint) {
                       free(data);
                     },
                     nullptr).ToLocalChecked();
}
```

## Debugging Streams

### Internal State Access

```javascript
const stream = getReadableStream();

// Access internal state
const state = stream._readableState;
console.log({
  highWaterMark: state.highWaterMark,
  length: state.length,
  flowing: state.flowing,
  ended: state.ended,
  reading: state.reading,
  needReadable: state.needReadable
});

const writable = getWritableStream();
const wState = writable._writableState;
console.log({
  highWaterMark: wState.highWaterMark,
  length: wState.length,
  writing: wState.writing,
  ended: wState.ended,
  finished: wState.finished,
  bufferProcessing: wState.bufferProcessing
});
```

### Tracing Stream Events

```javascript
const { EventEmitter } = require('node:events');

const originalEmit = EventEmitter.prototype.emit;
EventEmitter.prototype.emit = function(event, ...args) {
  if (this._readableState || this._writableState) {
    console.log(`[${this.constructor.name}] ${event}`, args.slice(0, 1));
  }
  return originalEmit.call(this, event, ...args);
};
```

## Common Issues

### Backpressure Ignored

```javascript
// BAD: Ignoring write() return value
for (const chunk of chunks) {
  stream.write(chunk);  // May buffer indefinitely!
}

// GOOD: Respect backpressure
async function writeWithBackpressure(stream, chunks) {
  for (const chunk of chunks) {
    if (!stream.write(chunk)) {
      await once(stream, 'drain');
    }
  }
}
```

### Stream Destroyed Before Data Consumed

```javascript
// BAD: Data lost
stream.on('data', (chunk) => {
  processAsync(chunk);  // Not awaited
});
stream.on('end', () => {
  // Processing may not be complete!
});

// GOOD: Use pipeline or async iteration
for await (const chunk of stream) {
  await processAsync(chunk);
}
```

## References

- Node.js Streams source: `lib/internal/streams/`
- StreamBase: `src/stream_base.h`, `src/stream_base.cc`
- TCP implementation: `src/tcp_wrap.cc`
