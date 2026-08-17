---
name: websockets
description: WebSocket support in Fastify
metadata:
  tags: websockets, realtime, ws, socket
---

# WebSocket Support

## Contents

- [Using @fastify/websocket](#using-fastifywebsocket)
- [WebSocket with Hooks](#websocket-with-hooks)
- [Connection Options](#connection-options)
- [Broadcast to All Clients](#broadcast-to-all-clients)
- [Rooms/Channels Pattern](#roomschannels-pattern)
- [Structured Message Protocol](#structured-message-protocol)
- [Heartbeat/Ping-Pong](#heartbeatping-pong)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Rate Limiting WebSocket Messages](#rate-limiting-websocket-messages)
- [Graceful Shutdown](#graceful-shutdown)
- [Full-Duplex Stream Pattern](#full-duplex-stream-pattern)

## Using @fastify/websocket

Add WebSocket support to Fastify:

```typescript
import Fastify from 'fastify';
import websocket from '@fastify/websocket';

const app = Fastify();

app.register(websocket);

app.get('/ws', { websocket: true }, (socket, request) => {
  socket.on('message', (message) => {
    const data = message.toString();
    console.log('Received:', data);

    // Echo back
    socket.send(`Echo: ${data}`);
  });

  socket.on('close', () => {
    console.log('Client disconnected');
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

await app.listen({ port: 3000 });
```

## WebSocket with Hooks

Use Fastify hooks with WebSocket routes:

```typescript
app.register(async function wsRoutes(fastify) {
  // This hook runs before WebSocket upgrade
  fastify.addHook('preValidation', async (request, reply) => {
    const token = request.headers.authorization;
    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    request.user = await verifyToken(token);
  });

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    console.log('Connected user:', request.user.id);

    socket.on('message', (message) => {
      // Handle authenticated messages
    });
  });
});
```

## Connection Options

Configure WebSocket server options:

```typescript
app.register(websocket, {
  options: {
    maxPayload: 1048576, // 1MB max message size
    clientTracking: true,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3,
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024,
      },
    },
  },
});
```

## Broadcast to All Clients

Broadcast messages to connected clients:

```typescript
const clients = new Set<WebSocket>();

app.get('/ws', { websocket: true }, (socket, request) => {
  clients.add(socket);

  socket.on('close', () => {
    clients.delete(socket);
  });

  socket.on('message', (message) => {
    // Broadcast to all other clients
    for (const client of clients) {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });
});

// Broadcast from HTTP route
app.post('/broadcast', async (request) => {
  const { message } = request.body;

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'broadcast', message }));
    }
  }

  return { sent: clients.size };
});
```

## Rooms/Channels Pattern

Organize connections into rooms:

```typescript
const rooms = new Map<string, Set<WebSocket>>();

function joinRoom(socket: WebSocket, roomId: string) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId)!.add(socket);
}

function leaveRoom(socket: WebSocket, roomId: string) {
  rooms.get(roomId)?.delete(socket);
  if (rooms.get(roomId)?.size === 0) {
    rooms.delete(roomId);
  }
}

function broadcastToRoom(roomId: string, message: string, exclude?: WebSocket) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const client of room) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

app.get('/ws/:roomId', { websocket: true }, (socket, request) => {
  const { roomId } = request.params as { roomId: string };

  joinRoom(socket, roomId);

  socket.on('message', (message) => {
    broadcastToRoom(roomId, message.toString(), socket);
  });

  socket.on('close', () => {
    leaveRoom(socket, roomId);
  });
});
```

## Structured Message Protocol

Use JSON for structured messages:

```typescript
interface WSMessage {
  type: string;
  payload?: unknown;
  id?: string;
}

app.get('/ws', { websocket: true }, (socket, request) => {
  function send(message: WSMessage) {
    socket.send(JSON.stringify(message));
  }

  socket.on('message', (raw) => {
    let message: WSMessage;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      send({ type: 'error', payload: 'Invalid JSON' });
      return;
    }

    switch (message.type) {
      case 'ping':
        send({ type: 'pong', id: message.id });
        break;

      case 'subscribe':
        handleSubscribe(socket, message.payload);
        send({ type: 'subscribed', payload: message.payload, id: message.id });
        break;

      case 'message':
        handleMessage(socket, message.payload);
        break;

      default:
        send({ type: 'error', payload: 'Unknown message type' });
    }
  });
});
```

## Heartbeat/Ping-Pong

Keep connections alive:

```typescript
const HEARTBEAT_INTERVAL = 30000;
const clients = new Map<WebSocket, { isAlive: boolean }>();

app.get('/ws', { websocket: true }, (socket, request) => {
  clients.set(socket, { isAlive: true });

  socket.on('pong', () => {
    const client = clients.get(socket);
    if (client) client.isAlive = true;
  });

  socket.on('close', () => {
    clients.delete(socket);
  });
});

// Heartbeat interval
setInterval(() => {
  for (const [socket, state] of clients) {
    if (!state.isAlive) {
      socket.terminate();
      clients.delete(socket);
      continue;
    }

    state.isAlive = false;
    socket.ping();
  }
}, HEARTBEAT_INTERVAL);
```

## Authentication

Authenticate WebSocket connections:

```typescript
app.get('/ws', {
  websocket: true,
  preValidation: async (request, reply) => {
    // Authenticate via query parameter or header
    const token = request.query.token || request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      reply.code(401).send({ error: 'Token required' });
      return;
    }

    try {
      request.user = await verifyToken(token);
    } catch {
      reply.code(401).send({ error: 'Invalid token' });
    }
  },
}, (socket, request) => {
  console.log('Authenticated user:', request.user);

  socket.on('message', (message) => {
    // Handle authenticated messages
  });
});
```

## Error Handling

Handle WebSocket errors properly:

```typescript
app.get('/ws', { websocket: true }, (socket, request) => {
  socket.on('error', (error) => {
    request.log.error({ err: error }, 'WebSocket error');
  });

  socket.on('message', async (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      const result = await processMessage(message);
      socket.send(JSON.stringify({ success: true, result }));
    } catch (error) {
      request.log.error({ err: error }, 'Message processing error');
      socket.send(JSON.stringify({
        success: false,
        error: error.message,
      }));
    }
  });
});
```

## Rate Limiting WebSocket Messages

Limit message frequency:

```typescript
const rateLimits = new Map<WebSocket, { count: number; resetAt: number }>();

function checkRateLimit(socket: WebSocket, limit: number, window: number): boolean {
  const now = Date.now();
  let state = rateLimits.get(socket);

  if (!state || now > state.resetAt) {
    state = { count: 0, resetAt: now + window };
    rateLimits.set(socket, state);
  }

  state.count++;

  if (state.count > limit) {
    return false;
  }

  return true;
}

app.get('/ws', { websocket: true }, (socket, request) => {
  socket.on('message', (message) => {
    if (!checkRateLimit(socket, 100, 60000)) {
      socket.send(JSON.stringify({ error: 'Rate limit exceeded' }));
      return;
    }

    // Process message
  });

  socket.on('close', () => {
    rateLimits.delete(socket);
  });
});
```

## Graceful Shutdown

Close WebSocket connections on shutdown:

```typescript
import closeWithGrace from 'close-with-grace';

const connections = new Set<WebSocket>();

app.get('/ws', { websocket: true }, (socket, request) => {
  connections.add(socket);

  socket.on('close', () => {
    connections.delete(socket);
  });
});

closeWithGrace({ delay: 5000 }, async ({ signal }) => {
  // Notify clients
  for (const socket of connections) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'shutdown', message: 'Server is shutting down' }));
      socket.close(1001, 'Server shutdown');
    }
  }

  await app.close();
});
```

## Full-Duplex Stream Pattern

Use WebSocket for streaming data:

```typescript
app.get('/ws/stream', { websocket: true }, async (socket, request) => {
  const stream = createDataStream();

  stream.on('data', (data) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'data', payload: data }));
    }
  });

  stream.on('end', () => {
    socket.send(JSON.stringify({ type: 'end' }));
    socket.close();
  });

  socket.on('message', (message) => {
    const { type, payload } = JSON.parse(message.toString());

    if (type === 'pause') {
      stream.pause();
    } else if (type === 'resume') {
      stream.resume();
    }
  });

  socket.on('close', () => {
    stream.destroy();
  });
});
```
