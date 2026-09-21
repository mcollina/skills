---
name: child-process-internals
description: IPC, spawn, fork implementation in Node.js
metadata:
  tags: child-process, ipc, spawn, fork, exec, internals
---

# Node.js Child Process Internals

Understanding how child processes work helps optimize multi-process architectures and debug IPC issues.

## Architecture

```
JavaScript Layer (lib/child_process.js)
├── spawn()
├── fork()
├── exec()
└── execFile()
        │
        ▼
Internal JS (lib/internal/child_process.js)
├── ChildProcess class
├── setupChannel()
└── spawnSync
        │
        ▼
C++ Bindings (src/process_wrap.cc)
├── ProcessWrap
└── Spawn(), Kill()
        │
        ▼
libuv
├── uv_spawn()
├── uv_process_kill()
└── uv_pipe_t (for stdio)
```

## spawn() Implementation

### JavaScript Layer

```javascript
// lib/child_process.js

function spawn(file, args, options) {
  options = normalizeSpawnArguments(file, args, options);

  const child = new ChildProcess();

  child.spawn({
    file: options.file,
    args: options.args,
    cwd: options.cwd,
    detached: !!options.detached,
    envPairs: options.envPairs,
    stdio: options.stdio,
    uid: options.uid,
    gid: options.gid,
  });

  return child;
}
```

### C++ ProcessWrap

```cpp
// From src/process_wrap.cc

void ProcessWrap::Spawn(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  ProcessWrap* wrap;
  ASSIGN_OR_RETURN_UNWRAP(&wrap, args.This());

  Local<Object> js_options = args[0].As<Object>();

  // Get file path
  Local<Value> file_v = js_options->Get(env->context(), env->file_string())
                            .ToLocalChecked();
  node::Utf8Value file(env->isolate(), file_v);

  // Set up uv_process_options_t
  uv_process_options_t options;
  memset(&options, 0, sizeof(uv_process_options_t));

  options.file = *file;
  options.args = args_array;
  options.cwd = cwd.length() > 0 ? *cwd : nullptr;
  options.env = env_array;
  options.stdio = stdio;
  options.stdio_count = stdio_count;

  // Set UID/GID if specified
  if (uid != static_cast<uv_uid_t>(-1)) {
    options.uid = uid;
    options.flags |= UV_PROCESS_SETUID;
  }

  // Spawn the process
  int err = uv_spawn(env->event_loop(), &wrap->process_, &options);

  if (err != 0) {
    // Return error to JavaScript
    args.GetReturnValue().Set(err);
    return;
  }

  // Return PID
  args.GetReturnValue().Set(wrap->process_.pid);
}
```

## fork() and IPC

### Fork Implementation

```javascript
// lib/child_process.js

function fork(modulePath, args, options) {
  options = Object.assign({}, options);

  // Force IPC channel
  options.stdio = options.stdio ? options.stdio.slice() : 'pipe';
  if (!options.stdio.includes('ipc')) {
    options.stdio.push('ipc');
  }

  // Use node executable
  options.execPath = options.execPath || process.execPath;

  return spawn(options.execPath, [modulePath, ...args], options);
}
```

### IPC Channel Setup

```javascript
// lib/internal/child_process.js

function setupChannel(target, channel, serializationMode) {
  // Set up message handling
  channel.onread = function(arrayBuffer) {
    const message = deserialize(arrayBuffer);
    target.emit('message', message.message, message.handle);
  };

  // Set up send function
  target.send = function(message, handle, options, callback) {
    const serialized = serialize({ message, handle });
    return channel.writeUtf8String(serialized);
  };

  // Handle disconnect
  channel.onDisconnect = function() {
    target.connected = false;
    target.emit('disconnect');
  };
}
```

### IPC Message Format

```javascript
// Messages are serialized with structure:
{
  cmd: 'NODE_HANDLE',     // or custom command
  type: 'net.Server',     // handle type
  msg: { ... },           // user message
  _handleId: 123          // internal handle ID
}
```

### C++ IPC Implementation

```cpp
// From src/stream_wrap.cc

// IPC uses named pipes (Windows) or Unix domain sockets
void StreamWrap::SetupIPC() {
  // Create pipe for IPC
  int fds[2];
  int err = uv_socketpair(SOCK_STREAM, 0, fds, UV_NONBLOCK_PIPE, UV_NONBLOCK_PIPE);

  // Pass file descriptor to child
  // Child inherits fd and creates its own pipe handle
}
```

## Handle Passing

Node.js can pass handles (sockets, servers) between processes:

```javascript
// Parent
const server = net.createServer();
server.listen(8000);

const child = fork('worker.js');
child.send({ type: 'server' }, server);

// Worker
process.on('message', (msg, handle) => {
  if (msg.type === 'server') {
    handle.on('connection', (socket) => {
      // Handle connection in worker
    });
  }
});
```

### Handle Serialization

```cpp
// From src/stream_base.cc

// Handles are sent as file descriptors over Unix sockets
int StreamBase::SendFD(uv_stream_t* handle, int fd) {
  // Use SCM_RIGHTS to pass file descriptor
  struct msghdr msg;
  struct cmsghdr* cmsg;

  msg.msg_control = control;
  msg.msg_controllen = sizeof(control);

  cmsg = CMSG_FIRSTHDR(&msg);
  cmsg->cmsg_level = SOL_SOCKET;
  cmsg->cmsg_type = SCM_RIGHTS;
  cmsg->cmsg_len = CMSG_LEN(sizeof(int));

  *((int*)CMSG_DATA(cmsg)) = fd;

  return sendmsg(socket, &msg, 0);
}
```

## stdio Configuration

### Stdio Options

```javascript
// Different stdio configurations
spawn('cmd', args, {
  stdio: 'inherit'           // Share parent's stdio
});

spawn('cmd', args, {
  stdio: 'pipe'              // Create pipes (default)
});

spawn('cmd', args, {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']  // With IPC
});

spawn('cmd', args, {
  stdio: [0, 1, 2]           // Inherit specific fds
});

spawn('cmd', args, {
  stdio: ['pipe', fs.openSync('out.log', 'w'), 'pipe']
});
```

### C++ stdio Setup

```cpp
// From src/process_wrap.cc

void ProcessWrap::ParseStdioOptions(Environment* env,
                                    Local<Object> js_options,
                                    uv_process_options_t* options) {
  Local<Value> stdio_v = js_options->Get(env->context(),
                                          env->stdio_string())
                             .ToLocalChecked();

  Local<Array> stdios = stdio_v.As<Array>();

  for (uint32_t i = 0; i < stdios->Length(); i++) {
    Local<Object> stdio = stdios->Get(env->context(), i)
                              .ToLocalChecked().As<Object>();

    Local<Value> type_v = stdio->Get(env->context(), env->type_string())
                              .ToLocalChecked();

    if (type_v->StrictEquals(env->ignore_string())) {
      options->stdio[i].flags = UV_IGNORE;
    } else if (type_v->StrictEquals(env->pipe_string())) {
      options->stdio[i].flags = UV_CREATE_PIPE | UV_READABLE_PIPE |
                                 UV_WRITABLE_PIPE;
      // Create pipe handle...
    } else if (type_v->StrictEquals(env->inherit_string())) {
      options->stdio[i].flags = UV_INHERIT_FD;
      options->stdio[i].data.fd = i;
    }
  }
}
```

## exec() and execFile()

### exec() Implementation

```javascript
// lib/child_process.js

function exec(command, options, callback) {
  // Use shell
  return execFile(options.shell || '/bin/sh',
                  ['-c', command],
                  options,
                  callback);
}

function execFile(file, args, options, callback) {
  options = {
    ...options,
    shell: false,
    maxBuffer: options.maxBuffer || 1024 * 1024  // 1MB
  };

  const child = spawn(file, args, options);

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.length > options.maxBuffer) {
      child.kill();
      callback(new Error('maxBuffer exceeded'));
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  child.on('close', (code, signal) => {
    callback(code === 0 ? null : new Error(`Exit code ${code}`),
             stdout,
             stderr);
  });

  return child;
}
```

## Synchronous Operations

### spawnSync Implementation

```javascript
// Uses libuv's synchronous spawn
const { spawnSync } = require('child_process');

const result = spawnSync('ls', ['-la'], {
  encoding: 'utf8'
});

console.log(result.stdout);
console.log(result.status);  // Exit code
```

```cpp
// From src/spawn_sync.cc

void SyncProcessRunner::Spawn(Local<Object> options) {
  // Run event loop synchronously until process exits
  int r;
  do {
    r = uv_run(&loop_, UV_RUN_ONCE);
  } while (r != 0 && !process_exited_);
}
```

## Signal Handling

### Sending Signals

```javascript
const child = spawn('long-running-process');

// Send signal
child.kill('SIGTERM');

// Or with process.kill
process.kill(child.pid, 'SIGKILL');
```

### C++ Signal Implementation

```cpp
// From src/process_wrap.cc

void ProcessWrap::Kill(const FunctionCallbackInfo<Value>& args) {
  ProcessWrap* wrap;
  ASSIGN_OR_RETURN_UNWRAP(&wrap, args.This());

  int signal = args[0].As<Int32>()->Value();

  int err = uv_process_kill(&wrap->process_, signal);

  args.GetReturnValue().Set(err);
}
```

## Detached Processes

```javascript
// Create daemon process
const child = spawn('daemon-process', [], {
  detached: true,
  stdio: 'ignore'
});

child.unref();  // Allow parent to exit
```

```cpp
// From src/process_wrap.cc

if (js_options->Get(env->context(), env->detached_string())
        .ToLocalChecked()->IsTrue()) {
  options.flags |= UV_PROCESS_DETACHED;
}
```

## Performance Considerations

### Process Pool Pattern

```javascript
const { fork } = require('child_process');

class ProcessPool {
  constructor(modulePath, size = 4) {
    this.workers = [];
    this.queue = [];
    this.currentIndex = 0;

    for (let i = 0; i < size; i++) {
      const worker = fork(modulePath);
      worker.on('message', (result) => {
        const { resolve } = worker.currentTask;
        worker.currentTask = null;
        resolve(result);
        this.processQueue();
      });
      this.workers.push(worker);
    }
  }

  execute(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  processQueue() {
    if (this.queue.length === 0) return;

    const worker = this.getAvailableWorker();
    if (!worker) return;

    const { task, resolve, reject } = this.queue.shift();
    worker.currentTask = { resolve, reject };
    worker.send(task);
  }

  getAvailableWorker() {
    return this.workers.find(w => !w.currentTask);
  }

  destroy() {
    this.workers.forEach(w => w.kill());
  }
}
```

### Avoid exec() Overhead

```javascript
// BAD: Shell spawning overhead
exec('ls -la', (err, stdout) => { });

// GOOD: Direct execution
execFile('ls', ['-la'], (err, stdout) => { });

// BETTER: spawn with streaming
const child = spawn('ls', ['-la']);
child.stdout.pipe(process.stdout);
```

## Debugging

### Trace Child Processes

```javascript
const child = spawn('command', args);

console.log('Spawned child pid:', child.pid);

child.on('error', (err) => {
  console.error('Failed to start:', err);
});

child.on('exit', (code, signal) => {
  console.log('Exited:', { code, signal });
});
```

### IPC Debugging

```javascript
// Parent
child.on('message', (msg) => {
  console.log('[IPC] Received:', JSON.stringify(msg));
});

const originalSend = child.send.bind(child);
child.send = (msg, ...args) => {
  console.log('[IPC] Sending:', JSON.stringify(msg));
  return originalSend(msg, ...args);
};
```

## Common Issues

### EPERM on Kill

```javascript
child.kill('SIGTERM');  // May fail with EPERM

// Check if process is still alive
if (child.exitCode === null && child.signalCode === null) {
  try {
    process.kill(child.pid, 0);  // Check existence
  } catch (e) {
    if (e.code !== 'ESRCH') throw e;
  }
}
```

### IPC Serialization Limits

```javascript
// BAD: Large messages
child.send({ data: largeBuffer });  // May fail or be slow

// GOOD: Use shared memory or files for large data
const shm = createSharedArrayBuffer(size);
child.send({ shmName: shm.name });
```

### Zombie Processes

```javascript
// Always handle child exit
child.on('exit', () => {
  // Cleanup
});

// Or with spawn options
spawn('cmd', args, {
  detached: true,
  stdio: 'ignore'
}).unref();  // Won't keep parent alive
```

## References

- Node.js child_process: `lib/child_process.js`
- Internal implementation: `lib/internal/child_process.js`
- C++ bindings: `src/process_wrap.cc`
- libuv process: `deps/uv/src/unix/process.c`
