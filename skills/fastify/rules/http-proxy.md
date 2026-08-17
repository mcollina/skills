---
name: http-proxy
description: HTTP proxying and reply.from() in Fastify
metadata:
  tags: proxy, gateway, reverse-proxy, microservices
---

# HTTP Proxy and Reply.from()

## Contents

- [@fastify/http-proxy](#fastifyhttp-proxy)
- [@fastify/reply-from](#fastifyreply-from)
- [API Gateway Pattern](#api-gateway-pattern)
- [Request Body Handling](#request-body-handling)
- [Error Handling](#error-handling)
- [WebSocket Proxying](#websocket-proxying)
- [Timeout Configuration](#timeout-configuration)
- [Caching Proxied Responses](#caching-proxied-responses)

## @fastify/http-proxy

Use `@fastify/http-proxy` for simple reverse proxy scenarios:

```typescript
import Fastify from 'fastify';
import httpProxy from '@fastify/http-proxy';

const app = Fastify({ logger: true });

// Proxy all requests to /api/* to another service
app.register(httpProxy, {
  upstream: 'http://backend-service:3001',
  prefix: '/api',
  rewritePrefix: '/v1',
  http2: false,
});

// With authentication
app.register(httpProxy, {
  upstream: 'http://internal-api:3002',
  prefix: '/internal',
  preHandler: async (request, reply) => {
    // Verify authentication before proxying
    if (!request.headers.authorization) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  },
});

await app.listen({ port: 3000 });
```

## @fastify/reply-from

For more control over proxying, use `@fastify/reply-from` with `reply.from()`:

```typescript
import Fastify from 'fastify';
import replyFrom from '@fastify/reply-from';

const app = Fastify({ logger: true });

app.register(replyFrom, {
  base: 'http://backend-service:3001',
  http2: false,
});

// Proxy with request/response manipulation
app.get('/users/:id', async (request, reply) => {
  const { id } = request.params;

  return reply.from(`/api/users/${id}`, {
    // Modify request before forwarding
    rewriteRequestHeaders: (originalReq, headers) => ({
      ...headers,
      'x-request-id': request.id,
      'x-forwarded-for': request.ip,
    }),
    // Modify response before sending
    onResponse: (request, reply, res) => {
      reply.header('x-proxy', 'fastify');
      reply.send(res);
    },
  });
});

// Conditional routing
app.all('/api/*', async (request, reply) => {
  const upstream = selectUpstream(request);

  return reply.from(request.url, {
    base: upstream,
  });
});

function selectUpstream(request) {
  // Route to different backends based on request
  if (request.headers['x-beta']) {
    return 'http://beta-backend:3001';
  }
  return 'http://stable-backend:3001';
}
```

## API Gateway Pattern

Build an API gateway with multiple backends:

```typescript
import Fastify from 'fastify';
import replyFrom from '@fastify/reply-from';

const app = Fastify({ logger: true });

// Configure multiple upstreams
const services = {
  users: 'http://users-service:3001',
  orders: 'http://orders-service:3002',
  products: 'http://products-service:3003',
};

app.register(replyFrom);

// Route to user service
app.register(async function (fastify) {
  fastify.all('/*', async (request, reply) => {
    return reply.from(request.url.replace('/users', ''), {
      base: services.users,
    });
  });
}, { prefix: '/users' });

// Route to orders service
app.register(async function (fastify) {
  fastify.all('/*', async (request, reply) => {
    return reply.from(request.url.replace('/orders', ''), {
      base: services.orders,
    });
  });
}, { prefix: '/orders' });

// Route to products service
app.register(async function (fastify) {
  fastify.all('/*', async (request, reply) => {
    return reply.from(request.url.replace('/products', ''), {
      base: services.products,
    });
  });
}, { prefix: '/products' });
```

## Request Body Handling

Handle request bodies when proxying:

```typescript
app.post('/api/data', async (request, reply) => {
  return reply.from('/data', {
    body: request.body,
    contentType: request.headers['content-type'],
  });
});

// Stream large bodies
app.post('/upload', async (request, reply) => {
  return reply.from('/upload', {
    body: request.raw,
    contentType: request.headers['content-type'],
  });
});
```

## Error Handling

Handle upstream errors gracefully:

```typescript
app.register(replyFrom, {
  base: 'http://backend:3001',
  // Called when upstream returns an error
  onError: (reply, error) => {
    reply.log.error({ err: error }, 'Proxy error');
    reply.code(502).send({
      error: 'Bad Gateway',
      message: 'Upstream service unavailable',
    });
  },
});

// Custom error handling per route
app.get('/data', async (request, reply) => {
  try {
    return await reply.from('/data');
  } catch (error) {
    request.log.error({ err: error }, 'Failed to proxy request');
    return reply.code(503).send({
      error: 'Service Unavailable',
      retryAfter: 30,
    });
  }
});
```

## WebSocket Proxying

Proxy WebSocket connections:

```typescript
import Fastify from 'fastify';
import httpProxy from '@fastify/http-proxy';

const app = Fastify({ logger: true });

app.register(httpProxy, {
  upstream: 'http://ws-backend:3001',
  prefix: '/ws',
  websocket: true,
});
```

## Timeout Configuration

Configure proxy timeouts:

```typescript
app.register(replyFrom, {
  base: 'http://backend:3001',
  http: {
    requestOptions: {
      timeout: 30000, // 30 seconds
    },
  },
});
```

## Caching Proxied Responses

Add caching to proxied responses:

```typescript
import { createCache } from 'async-cache-dedupe';

const cache = createCache({
  ttl: 60,
  storage: { type: 'memory' },
});

cache.define('proxyGet', async (url: string) => {
  const response = await fetch(`http://backend:3001${url}`);
  return response.json();
});

app.get('/cached/*', async (request, reply) => {
  const data = await cache.proxyGet(request.url);
  return data;
});
```
