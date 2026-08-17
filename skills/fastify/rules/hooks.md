---
name: hooks
description: Hooks and request lifecycle in Fastify
metadata:
  tags: hooks, lifecycle, middleware, onRequest, preHandler
---

# Hooks and Request Lifecycle

## Contents

- [Request Lifecycle Overview](#request-lifecycle-overview)
- [onRequest Hook](#onrequest-hook)
- [preParsing Hook](#preparsing-hook)
- [preValidation Hook](#prevalidation-hook)
- [preHandler Hook](#prehandler-hook)
- [preSerialization Hook](#preserialization-hook)
- [onSend Hook](#onsend-hook)
- [onResponse Hook](#onresponse-hook)
- [onError Hook](#onerror-hook)
- [onTimeout Hook](#ontimeout-hook)
- [onRequestAbort Hook](#onrequestabort-hook)
- [Application Lifecycle Hooks](#application-lifecycle-hooks)
- [Scoped Hooks](#scoped-hooks)
- [Hook Execution Order](#hook-execution-order)
- [Stopping Hook Execution](#stopping-hook-execution)
- [Route-Level Hooks](#route-level-hooks)
- [Async Hook Patterns](#async-hook-patterns)

## Request Lifecycle Overview

Fastify executes hooks in a specific order:

```
Incoming Request
       |
   onRequest
       |
   preParsing
       |
   preValidation
       |
   preHandler
       |
     Handler
       |
   preSerialization
       |
    onSend
       |
   onResponse
```

## onRequest Hook

First hook to execute, before body parsing. Use for authentication, request ID setup:

```typescript
import Fastify from 'fastify';

const app = Fastify();

// Global onRequest hook
app.addHook('onRequest', async (request, reply) => {
  request.startTime = Date.now();
  request.log.info({ url: request.url, method: request.method }, 'Request started');
});

// Authentication check
app.addHook('onRequest', async (request, reply) => {
  // Skip auth for public routes
  if (request.url.startsWith('/public')) {
    return;
  }

  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
    return; // Stop processing
  }

  try {
    request.user = await verifyToken(token);
  } catch {
    reply.code(401).send({ error: 'Invalid token' });
  }
});
```

## preParsing Hook

Execute before body parsing. Can modify the payload stream:

```typescript
app.addHook('preParsing', async (request, reply, payload) => {
  // Log raw payload size
  request.log.debug({ contentLength: request.headers['content-length'] }, 'Parsing body');

  // Return modified payload stream if needed
  return payload;
});

// Decompress incoming data
app.addHook('preParsing', async (request, reply, payload) => {
  if (request.headers['content-encoding'] === 'gzip') {
    return payload.pipe(zlib.createGunzip());
  }
  return payload;
});
```

## preValidation Hook

Execute after parsing, before schema validation:

```typescript
app.addHook('preValidation', async (request, reply) => {
  // Modify body before validation
  if (request.body && typeof request.body === 'object') {
    // Normalize data
    request.body.email = request.body.email?.toLowerCase().trim();
  }
});

// Rate limiting check
app.addHook('preValidation', async (request, reply) => {
  const key = request.ip;
  const count = await redis.incr(`ratelimit:${key}`);

  if (count === 1) {
    await redis.expire(`ratelimit:${key}`, 60);
  }

  if (count > 100) {
    reply.code(429).send({ error: 'Too many requests' });
  }
});
```

## preHandler Hook

Most common hook, execute after validation, before handler:

```typescript
// Authorization check
app.addHook('preHandler', async (request, reply) => {
  const { userId } = request.params as { userId: string };

  if (request.user.id !== userId && !request.user.isAdmin) {
    reply.code(403).send({ error: 'Forbidden' });
  }
});

// Load related data
app.addHook('preHandler', async (request, reply) => {
  if (request.params?.projectId) {
    request.project = await db.projects.findById(request.params.projectId);
    if (!request.project) {
      reply.code(404).send({ error: 'Project not found' });
    }
  }
});

// Transaction wrapper
app.addHook('preHandler', async (request) => {
  request.transaction = await db.beginTransaction();
});

app.addHook('onResponse', async (request) => {
  if (request.transaction) {
    await request.transaction.commit();
  }
});

app.addHook('onError', async (request, reply, error) => {
  if (request.transaction) {
    await request.transaction.rollback();
  }
});
```

## preSerialization Hook

Modify payload before serialization:

```typescript
app.addHook('preSerialization', async (request, reply, payload) => {
  // Add metadata to all responses
  if (payload && typeof payload === 'object') {
    return {
      ...payload,
      _meta: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
      },
    };
  }
  return payload;
});

// Remove sensitive fields
app.addHook('preSerialization', async (request, reply, payload) => {
  if (payload?.user?.password) {
    const { password, ...user } = payload.user;
    return { ...payload, user };
  }
  return payload;
});
```

## onSend Hook

Modify response after serialization:

```typescript
app.addHook('onSend', async (request, reply, payload) => {
  // Add response headers
  reply.header('X-Response-Time', Date.now() - request.startTime);

  // Compress response
  if (payload && payload.length > 1024) {
    const compressed = await gzip(payload);
    reply.header('Content-Encoding', 'gzip');
    return compressed;
  }

  return payload;
});

// Transform JSON string response
app.addHook('onSend', async (request, reply, payload) => {
  if (reply.getHeader('content-type')?.includes('application/json')) {
    // payload is already a string at this point
    return payload;
  }
  return payload;
});
```

## onResponse Hook

Execute after response is sent. Cannot modify response:

```typescript
app.addHook('onResponse', async (request, reply) => {
  // Log response time
  const responseTime = Date.now() - request.startTime;
  request.log.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    responseTime,
  }, 'Request completed');

  // Track metrics
  metrics.histogram('http_request_duration', responseTime, {
    method: request.method,
    route: request.routeOptions.url,
    status: reply.statusCode,
  });
});
```

## onError Hook

Execute when an error is thrown:

```typescript
app.addHook('onError', async (request, reply, error) => {
  // Log error details
  request.log.error({
    err: error,
    url: request.url,
    method: request.method,
    body: request.body,
  }, 'Request error');

  // Track error metrics
  metrics.increment('http_errors', {
    error: error.code || 'UNKNOWN',
    route: request.routeOptions.url,
  });

  // Cleanup resources
  if (request.tempFile) {
    await fs.unlink(request.tempFile).catch(() => {});
  }
});
```

## onTimeout Hook

Execute when request times out:

```typescript
const app = Fastify({
  connectionTimeout: 30000, // 30 seconds
});

app.addHook('onTimeout', async (request, reply) => {
  request.log.warn({
    url: request.url,
    method: request.method,
  }, 'Request timeout');

  // Cleanup
  if (request.abortController) {
    request.abortController.abort();
  }
});
```

## onRequestAbort Hook

Execute when client closes connection:

```typescript
app.addHook('onRequestAbort', async (request) => {
  request.log.info('Client aborted request');

  // Cancel ongoing operations
  if (request.abortController) {
    request.abortController.abort();
  }

  // Cleanup uploaded files
  if (request.uploadedFiles) {
    for (const file of request.uploadedFiles) {
      await fs.unlink(file.path).catch(() => {});
    }
  }
});
```

## Application Lifecycle Hooks

Hooks that run at application startup/shutdown:

```typescript
// After all plugins are loaded
app.addHook('onReady', async function () {
  this.log.info('Server is ready');

  // Initialize connections
  await this.db.connect();
  await this.redis.connect();

  // Warm caches
  await this.cache.warmup();
});

// When server is closing
app.addHook('onClose', async function () {
  this.log.info('Server is closing');

  // Cleanup connections
  await this.db.close();
  await this.redis.disconnect();
});

// After routes are registered
app.addHook('onRoute', (routeOptions) => {
  console.log(`Route registered: ${routeOptions.method} ${routeOptions.url}`);

  // Track all routes
  routes.push({
    method: routeOptions.method,
    url: routeOptions.url,
    schema: routeOptions.schema,
  });
});

// After plugin is registered
app.addHook('onRegister', (instance, options) => {
  console.log(`Plugin registered with prefix: ${options.prefix}`);
});
```

## Scoped Hooks

Hooks are scoped to their encapsulation context:

```typescript
app.addHook('onRequest', async (request) => {
  // Runs for ALL routes
  request.log.info('Global hook');
});

app.register(async function adminRoutes(fastify) {
  // Only runs for routes in this plugin
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.user?.isAdmin) {
      reply.code(403).send({ error: 'Admin only' });
    }
  });

  fastify.get('/admin/users', async () => {
    return { users: [] };
  });
}, { prefix: '/admin' });
```

## Hook Execution Order

Multiple hooks of the same type execute in registration order:

```typescript
app.addHook('onRequest', async () => {
  console.log('First');
});

app.addHook('onRequest', async () => {
  console.log('Second');
});

app.addHook('onRequest', async () => {
  console.log('Third');
});

// Output: First, Second, Third
```

## Stopping Hook Execution

Return early from hooks to stop processing:

```typescript
app.addHook('preHandler', async (request, reply) => {
  if (!request.user) {
    // Send response and return to stop further processing
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  // Continue to next hook and handler
});
```

## Route-Level Hooks

Add hooks to specific routes:

```typescript
const adminOnlyHook = async (request, reply) => {
  if (!request.user?.isAdmin) {
    reply.code(403).send({ error: 'Forbidden' });
  }
};

app.get('/admin/settings', {
  preHandler: [adminOnlyHook],
  handler: async (request) => {
    return { settings: {} };
  },
});

// Multiple hooks
app.post('/orders', {
  preValidation: [validateApiKey],
  preHandler: [loadUser, checkQuota, logOrder],
  handler: createOrderHandler,
});
```

## Async Hook Patterns

Always use async/await in hooks:

```typescript
// GOOD - async hook
app.addHook('preHandler', async (request, reply) => {
  const user = await loadUser(request.headers.authorization);
  request.user = user;
});

// AVOID - callback style (deprecated)
app.addHook('preHandler', (request, reply, done) => {
  loadUser(request.headers.authorization)
    .then((user) => {
      request.user = user;
      done();
    })
    .catch(done);
});
```
