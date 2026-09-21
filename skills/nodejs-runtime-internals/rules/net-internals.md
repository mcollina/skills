---
name: net-internals
description: TCP/UDP implementation, socket handling in Node.js
metadata:
  tags: net, tcp, udp, sockets, internals, libuv, networking
---

# Node.js Net Internals

Understanding how TCP/UDP networking works at the C++ level helps debug connection issues and optimize high-throughput network applications.

## Architecture

```
JavaScript Layer
├── net.Server (lib/net.js)
├── net.Socket (lib/net.js)
└── dgram.Socket (lib/dgram.js)
        │
        ▼
C++ Bindings
├── TCPWrap (src/tcp_wrap.cc)
├── UDPWrap (src/udp_wrap.cc)
├── PipeWrap (src/pipe_wrap.cc)
└── StreamWrap (src/stream_wrap.cc)
        │
        ▼
libuv
├── uv_tcp_t
├── uv_udp_t
└── uv_pipe_t
        │
        ▼
System Calls
├── socket(), bind(), listen(), accept()
├── connect(), read(), write()
└── epoll/kqueue/IOCP
```

## TCP Server Implementation

### JavaScript Layer

```javascript
// lib/net.js (simplified)

class Server extends EventEmitter {
  constructor(options, connectionListener) {
    super();
    this._handle = null;
    this._connections = 0;

    if (connectionListener) {
      this.on('connection', connectionListener);
    }
  }

  listen(port, host, backlog, callback) {
    // Create TCP handle
    this._handle = new TCP(TCPConstants.SERVER);

    // Bind
    const err = this._handle.bind(host, port);
    if (err) {
      this._handle.close();
      throw errnoException(err, 'bind');
    }

    // Listen
    const listenErr = this._handle.listen(backlog);
    if (listenErr) {
      this._handle.close();
      throw errnoException(listenErr, 'listen');
    }

    // Set up connection callback
    this._handle.onconnection = onconnection;
  }
}

function onconnection(err, clientHandle) {
  const self = this.owner;

  if (err) {
    self.emit('error', errnoException(err, 'accept'));
    return;
  }

  // Create Socket wrapper
  const socket = new Socket({
    handle: clientHandle,
    allowHalfOpen: self.allowHalfOpen,
    pauseOnCreate: self.pauseOnConnect
  });

  self._connections++;
  self.emit('connection', socket);
}
```

### C++ TCPWrap

```cpp
// src/tcp_wrap.cc

void TCPWrap::Listen(const FunctionCallbackInfo<Value>& args) {
  TCPWrap* wrap;
  ASSIGN_OR_RETURN_UNWRAP(&wrap, args.This());

  int backlog = args[0].As<Int32>()->Value();

  int err = uv_listen(reinterpret_cast<uv_stream_t*>(&wrap->handle_),
                      backlog,
                      OnConnection);

  args.GetReturnValue().Set(err);
}

void TCPWrap::OnConnection(uv_stream_t* handle, int status) {
  TCPWrap* tcp_wrap = ContainerOf(&TCPWrap::handle_,
                                   reinterpret_cast<uv_tcp_t*>(handle));
  Environment* env = tcp_wrap->env();
  HandleScope scope(env->isolate());

  if (status != 0) {
    tcp_wrap->MakeCallback(env->onconnection_string(),
                           1,
                           &Integer::New(env->isolate(), status));
    return;
  }

  // Create new handle for client
  Local<Object> client_obj;
  if (!TCPWrap::Instantiate(env, tcp_wrap, TCPWrap::SOCKET)
           .ToLocal(&client_obj)) {
    return;
  }

  TCPWrap* client_wrap;
  ASSIGN_OR_RETURN_UNWRAP(&client_wrap, client_obj);

  // Accept the connection
  int r = uv_accept(handle,
                    reinterpret_cast<uv_stream_t*>(&client_wrap->handle_));

  if (r == 0) {
    Local<Value> argv[] = { Integer::New(env->isolate(), 0), client_obj };
    tcp_wrap->MakeCallback(env->onconnection_string(), arraysize(argv), argv);
  }
}
```

## TCP Client Implementation

### Connect Flow

```javascript
// lib/net.js

Socket.prototype.connect = function(options, callback) {
  const self = this;

  // Create handle if not exists
  if (!this._handle) {
    this._handle = new TCP(TCPConstants.SOCKET);
    initSocketHandle(this);
  }

  // DNS lookup if needed
  if (isIP(options.host) === 0) {
    lookupAndConnect(this, options);
  } else {
    connect(this, options.host, options.port);
  }
};

function connect(socket, address, port) {
  const req = new TCPConnectWrap();
  req.oncomplete = afterConnect;
  req.address = address;
  req.port = port;

  const err = socket._handle.connect(req, address, port);

  if (err) {
    socket.destroy(errnoException(err, 'connect'));
  }
}

function afterConnect(status, handle, req, readable, writable) {
  const socket = handle.owner;

  if (status !== 0) {
    socket.destroy(errnoException(status, 'connect'));
    return;
  }

  socket.readable = readable;
  socket.writable = writable;

  socket._handle.readStart();
  socket.emit('connect');
}
```

### C++ Connect Implementation

```cpp
// src/tcp_wrap.cc

void TCPWrap::Connect(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  TCPWrap* wrap;
  ASSIGN_OR_RETURN_UNWRAP(&wrap, args.This());

  ConnectWrap* req_wrap;
  ASSIGN_OR_RETURN_UNWRAP(&req_wrap, args[0].As<Object>());

  node::Utf8Value ip_address(env->isolate(), args[1]);

  int port = args[2].As<Int32>()->Value();

  struct sockaddr_in addr;
  int err = uv_ip4_addr(*ip_address, port, &addr);

  if (err == 0) {
    err = uv_tcp_connect(&req_wrap->req_,
                         &wrap->handle_,
                         reinterpret_cast<const sockaddr*>(&addr),
                         AfterConnect);
  }

  args.GetReturnValue().Set(err);
}

void TCPWrap::AfterConnect(uv_connect_t* req, int status) {
  ConnectWrap* req_wrap = ContainerOf(&ConnectWrap::req_, req);
  TCPWrap* wrap = ContainerOf(&TCPWrap::handle_,
                               reinterpret_cast<uv_tcp_t*>(req->handle));
  Environment* env = wrap->env();

  HandleScope handle_scope(env->isolate());
  Context::Scope context_scope(env->context());

  bool readable = status == 0;
  bool writable = status == 0;

  Local<Value> argv[] = {
    Integer::New(env->isolate(), status),
    wrap->object(),
    req_wrap->object(),
    Boolean::New(env->isolate(), readable),
    Boolean::New(env->isolate(), writable)
  };

  req_wrap->MakeCallback(env->oncomplete_string(), arraysize(argv), argv);
}
```

## Socket Options

### TCP_NODELAY (Nagle's Algorithm)

```javascript
socket.setNoDelay(true);
```

```cpp
// src/tcp_wrap.cc
void TCPWrap::SetNoDelay(const FunctionCallbackInfo<Value>& args) {
  TCPWrap* wrap;
  ASSIGN_OR_RETURN_UNWRAP(&wrap, args.This());
  int enable = args[0].As<Boolean>()->Value() ? 1 : 0;
  int err = uv_tcp_nodelay(&wrap->handle_, enable);
  args.GetReturnValue().Set(err);
}
```

### Keep-Alive

```javascript
socket.setKeepAlive(true, 60000);
```

```cpp
// src/tcp_wrap.cc
void TCPWrap::SetKeepAlive(const FunctionCallbackInfo<Value>& args) {
  TCPWrap* wrap;
  ASSIGN_OR_RETURN_UNWRAP(&wrap, args.This());
  int enable = args[0].As<Boolean>()->Value() ? 1 : 0;
  unsigned int delay = args[1].As<Uint32>()->Value();
  int err = uv_tcp_keepalive(&wrap->handle_, enable, delay);
  args.GetReturnValue().Set(err);
}
```

## UDP Implementation

### JavaScript Layer

```javascript
// lib/dgram.js

class Socket extends EventEmitter {
  constructor(type, listener) {
    super();
    this.type = type;
    this._handle = new UDP();
    this._handle.owner = this;
    this._handle.onmessage = onMessage;
  }

  send(msg, offset, length, port, address, callback) {
    const req = new SendWrap();
    req.oncomplete = afterSend;
    req.callback = callback;

    const err = this._handle.send(req, msg, offset, length, port, address);

    if (err) {
      // Immediate error
      process.nextTick(callback, errnoException(err, 'send'));
    }
  }

  bind(port, address, callback) {
    const err = this._handle.bind(address, port, flags);
    if (err) {
      throw errnoException(err, 'bind');
    }

    // Start receiving
    const recvErr = this._handle.recvStart();
    if (recvErr) {
      throw errnoException(recvErr, 'recvStart');
    }
  }
}

function onMessage(nread, handle, buf, rinfo) {
  const self = handle.owner;
  self.emit('message', buf.slice(0, nread), rinfo);
}
```

### C++ UDPWrap

```cpp
// src/udp_wrap.cc

void UDPWrap::Send(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  UDPWrap* wrap;
  ASSIGN_OR_RETURN_UNWRAP(&wrap, args.This());

  SendWrap* req_wrap;
  ASSIGN_OR_RETURN_UNWRAP(&req_wrap, args[0].As<Object>());

  // Get buffer data
  Local<Object> buffer_obj = args[1].As<Object>();
  char* data = Buffer::Data(buffer_obj);
  size_t length = Buffer::Length(buffer_obj);

  // Get address info
  node::Utf8Value address(env->isolate(), args[4]);
  int port = args[3].As<Uint32>()->Value();

  struct sockaddr_in addr;
  uv_ip4_addr(*address, port, &addr);

  uv_buf_t buf = uv_buf_init(data, length);

  int err = uv_udp_send(&req_wrap->req_,
                        &wrap->handle_,
                        &buf,
                        1,
                        reinterpret_cast<const sockaddr*>(&addr),
                        OnSend);

  args.GetReturnValue().Set(err);
}

void UDPWrap::OnRecv(uv_udp_t* handle,
                     ssize_t nread,
                     const uv_buf_t* buf,
                     const struct sockaddr* addr,
                     unsigned int flags) {
  UDPWrap* wrap = ContainerOf(&UDPWrap::handle_, handle);
  Environment* env = wrap->env();

  if (nread < 0) {
    // Error
    wrap->MakeCallback(env->onmessage_string(),
                       1,
                       &Integer::New(env->isolate(), nread));
    return;
  }

  if (nread == 0 && addr == nullptr) {
    // Nothing received
    return;
  }

  // Create Buffer
  Local<Object> buffer = Buffer::Copy(env, buf->base, nread).ToLocalChecked();

  // Create rinfo object
  Local<Object> rinfo = Object::New(env->isolate());
  const struct sockaddr_in* addr4 = reinterpret_cast<const sockaddr_in*>(addr);
  char ip[INET6_ADDRSTRLEN];
  uv_ip4_name(addr4, ip, sizeof(ip));

  rinfo->Set(env->context(),
             env->address_string(),
             String::NewFromUtf8(env->isolate(), ip).ToLocalChecked()).Check();
  rinfo->Set(env->context(),
             env->port_string(),
             Integer::New(env->isolate(), ntohs(addr4->sin_port))).Check();

  Local<Value> argv[] = {
    Integer::New(env->isolate(), nread),
    wrap->object(),
    buffer,
    rinfo
  };

  wrap->MakeCallback(env->onmessage_string(), arraysize(argv), argv);
}
```

## Connection Tracking

### Active Handles

```javascript
// Get active socket handles
const handles = process._getActiveHandles();
const sockets = handles.filter(h =>
  h.constructor.name === 'TCP' ||
  h.constructor.name === 'Socket'
);

console.log(`Active sockets: ${sockets.length}`);
```

### Server Connection Counting

```javascript
const net = require('node:net');

const server = net.createServer();
const connections = new Set();

server.on('connection', (socket) => {
  connections.add(socket);

  socket.on('close', () => {
    connections.delete(socket);
  });

  // Track per-socket stats
  socket._bytesReceived = 0;
  socket._bytesSent = 0;

  socket.on('data', (chunk) => {
    socket._bytesReceived += chunk.length;
  });

  const originalWrite = socket.write.bind(socket);
  socket.write = function(data, encoding, callback) {
    socket._bytesSent += Buffer.byteLength(data);
    return originalWrite(data, encoding, callback);
  };
});

// Connection stats
setInterval(() => {
  console.log(`Active connections: ${connections.size}`);
  for (const socket of connections) {
    console.log(`  ${socket.remoteAddress}:${socket.remotePort} - ` +
                `rx: ${socket._bytesReceived}, tx: ${socket._bytesSent}`);
  }
}, 5000);
```

## Performance Considerations

### Socket Buffers

```javascript
const socket = net.connect(port, host);

// Increase kernel buffer sizes
// Must be done before connection
socket.setRecvBufferSize?.(1024 * 1024);  // Node 12+
socket.setSendBufferSize?.(1024 * 1024);  // Node 12+
```

### Connection Reuse (HTTP Keep-Alive)

```javascript
const http = require('node:http');

const agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 100,
  maxFreeSockets: 10
});

// All requests share connections
http.get({ host: 'example.com', agent }, callback);
```

## Debugging

### Socket State

```javascript
const socket = getSocket();

console.log({
  readyState: socket.readyState,
  pending: socket.pending,
  connecting: socket.connecting,
  readable: socket.readable,
  writable: socket.writable,
  destroyed: socket.destroyed,
  bytesRead: socket.bytesRead,
  bytesWritten: socket.bytesWritten,
  localAddress: socket.localAddress,
  localPort: socket.localPort,
  remoteAddress: socket.remoteAddress,
  remotePort: socket.remotePort
});
```

### strace/dtrace

```bash
# Linux: Trace socket system calls
strace -f -e trace=network node app.js

# macOS: DTrace
sudo dtrace -n 'syscall::connect:entry /pid == $target/ {
  printf("connect to %s", copyinstr(arg1));
}' -p $(pgrep -f "node app.js")
```

### libuv Statistics

```javascript
// Check event loop lag
const start = process.hrtime.bigint();
setImmediate(() => {
  const end = process.hrtime.bigint();
  console.log(`Event loop lag: ${(end - start) / 1000000n}ms`);
});
```

## Common Issues

### ECONNREFUSED

```javascript
socket.on('error', (err) => {
  if (err.code === 'ECONNREFUSED') {
    // Server not running or wrong port
    console.log(`Connection refused to ${err.address}:${err.port}`);
  }
});
```

### EADDRINUSE

```javascript
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${err.port} already in use`);
    // Try different port or use SO_REUSEADDR
  }
});

// Enable address reuse
server.listen({ port: 3000, reuseAddr: true });
```

### Connection Timeout

```javascript
const socket = net.connect(port, host);

socket.setTimeout(5000);
socket.on('timeout', () => {
  console.log('Connection timed out');
  socket.destroy();
});
```

## References

- Node.js net source: `lib/net.js`
- TCP wrap: `src/tcp_wrap.cc`, `src/tcp_wrap.h`
- UDP wrap: `src/udp_wrap.cc`, `src/udp_wrap.h`
- libuv TCP: `deps/uv/src/unix/tcp.c`
