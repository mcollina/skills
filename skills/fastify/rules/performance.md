---
name: performance
description: Performance optimization for Fastify applications
metadata:
  tags: performance, optimization, speed, benchmarking
---

# Performance Optimization

## Contents

- [Fastify is Fast by Default](#fastify-is-fast-by-default)
- [Use @fastify/under-pressure for Load Shedding](#use-fastifyunder-pressure-for-load-shedding)
- [Always Define Response Schemas](#always-define-response-schemas)
- [Avoid Dynamic Schema Compilation](#avoid-dynamic-schema-compilation)
- [Use Logger Wisely](#use-logger-wisely)
- [Connection Pooling](#connection-pooling)
- [Avoid Blocking the Event Loop](#avoid-blocking-the-event-loop)
- [Stream Large Responses](#stream-large-responses)
- [Caching Strategies](#caching-strategies)
- [Request Coalescing with async-cache-dedupe](#request-coalescing-with-async-cache-dedupe)
- [Payload Limits](#payload-limits)
- [Compression](#compression)
- [Connection Timeouts](#connection-timeouts)
- [Disable Unnecessary Features](#disable-unnecessary-features)
- [Benchmarking](#benchmarking)
- [Profiling](#profiling)
- [Memory Management](#memory-management)

## Fastify is Fast by Default

Fastify is designed for performance. Key optimizations are built-in:

- Fast JSON serialization with `fast-json-stringify`
- Efficient routing with `find-my-way`
- Schema-based validation with `ajv` (compiled validators)
- Low overhead request/response handling

## Use @fastify/under-pressure for Load Shedding

Protect your application from overload with `@fastify/under-pressure`:

```typescript
import underPressure from '@fastify/under-pressure';

app.register(underPressure, {
  maxEventLoopDelay: 1000,        // Max event loop delay in ms
  maxHeapUsedBytes: 1000000000,   // Max heap used (~1GB)
  maxRssBytes: 1500000000,        // Max RSS (~1.5GB)
  maxEventLoopUtilization: 0.98, // Max event loop utilization
  pressureHandler: (request, reply, type, value) => {
    reply.code(503).send({
      error: 'Service Unavailable',
      message: `Server under pressure: ${type}`,
    });
  },
});

// Health check that respects pressure
app.get('/health', async (request, reply) => {
  return { status: 'ok' };
});
```

## Always Define Response Schemas

Response schemas enable fast-json-stringify, which is significantly faster than JSON.stringify:

```typescript
// FAST - uses fast-json-stringify
app.get('/users', {
  schema: {
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
    },
  },
}, async () => {
  return db.users.findAll();
});

// SLOW - uses JSON.stringify
app.get('/users-slow', async () => {
  return db.users.findAll();
});
```

## Avoid Dynamic Schema Compilation

Add schemas at startup, not at request time:

```typescript
// GOOD - schemas compiled at startup
app.addSchema({ $id: 'user', ... });

app.get('/users', {
  schema: { response: { 200: { $ref: 'user#' } } },
}, handler);

// BAD - schema compiled per request
app.get('/users', async (request, reply) => {
  const schema = getSchemaForUser(request.user);
  // This is slow!
});
```

## Use Logger Wisely

Pino is fast, but excessive logging has overhead:

```typescript
import Fastify from 'fastify';

// Set log level via environment variable
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Avoid logging large objects
app.get('/data', async (request) => {
  // BAD - logs entire payload
  request.log.info({ data: largeObject }, 'Processing');

  // GOOD - log only what's needed
  request.log.info({ id: largeObject.id }, 'Processing');

  return largeObject;
});
```

## Connection Pooling

Use connection pools for databases:

```typescript
import postgres from 'postgres';

// Create pool at startup
const sql = postgres(process.env.DATABASE_URL, {
  max: 20, // Maximum pool size
  idle_timeout: 20,
  connect_timeout: 10,
});

app.decorate('db', sql);

// Connections are reused
app.get('/users', async () => {
  return app.db`SELECT * FROM users LIMIT 100`;
});
```

## Avoid Blocking the Event Loop

Use `piscina` for CPU-intensive operations. It provides a robust worker thread pool:

```typescript
import Piscina from 'piscina';
import { join } from 'node:path';

const piscina = new Piscina({
  filename: join(import.meta.dirname, 'workers', 'compute.js'),
});

app.post('/compute', async (request) => {
  const result = await piscina.run(request.body);
  return result;
});
```

```typescript
// workers/compute.js
export default function compute(data) {
  // CPU-intensive work here
  return processedResult;
}
```

## Stream Large Responses

Stream large payloads instead of buffering:

```typescript
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

// GOOD - stream file
app.get('/large-file', async (request, reply) => {
  const stream = createReadStream('./large-file.json');
  reply.type('application/json');
  return reply.send(stream);
});

// BAD - load entire file into memory
app.get('/large-file-bad', async () => {
  const content = await fs.readFile('./large-file.json', 'utf-8');
  return JSON.parse(content);
});

// Stream database results
app.get('/export', async (request, reply) => {
  reply.type('application/json');

  const cursor = db.users.findCursor();
  reply.raw.write('[');

  let first = true;
  for await (const user of cursor) {
    if (!first) reply.raw.write(',');
    reply.raw.write(JSON.stringify(user));
    first = false;
  }

  reply.raw.write(']');
  reply.raw.end();
});
```

## Caching Strategies

Implement caching for expensive operations:

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, unknown>({
  max: 1000,
  ttl: 60000, // 1 minute
});

app.get('/expensive/:id', async (request) => {
  const { id } = request.params;
  const cacheKey = `expensive:${id}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await expensiveOperation(id);
  cache.set(cacheKey, result);

  return result;
});

// Cache control headers
app.get('/static-data', async (request, reply) => {
  reply.header('Cache-Control', 'public, max-age=3600');
  return { data: 'static' };
});
```

## Request Coalescing with async-cache-dedupe

Use `async-cache-dedupe` for deduplicating concurrent identical requests and caching:

```typescript
import { createCache } from 'async-cache-dedupe';

const cache = createCache({
  ttl: 60, // seconds
  stale: 5, // serve stale while revalidating
  storage: { type: 'memory' },
});

cache.define('fetchData', async (id: string) => {
  return db.findById(id);
});

app.get('/data/:id', async (request) => {
  const { id } = request.params;
  // Automatically deduplicates concurrent requests for the same id
  // and caches the result
  return cache.fetchData(id);
});
```

For distributed caching, use Redis storage:

```typescript
import { createCache } from 'async-cache-dedupe';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const cache = createCache({
  ttl: 60,
  storage: { type: 'redis', options: { client: redis } },
});
```

## Payload Limits

Set appropriate payload limits:

```typescript
import Fastify from 'fastify';

const app = Fastify({
  bodyLimit: 1048576, // 1MB default
});

// Per-route limit for file uploads
app.post('/upload', {
  bodyLimit: 10485760, // 10MB for this route
}, uploadHandler);
```

## Compression

Use compression for responses:

```typescript
import fastifyCompress from '@fastify/compress';

app.register(fastifyCompress, {
  global: true,
  threshold: 1024, // Only compress responses > 1KB
  encodings: ['gzip', 'deflate'],
});

// Disable for specific route
app.get('/already-compressed', {
  compress: false,
}, handler);
```

## Connection Timeouts

Configure appropriate timeouts:

```typescript
import Fastify from 'fastify';

const app = Fastify({
  connectionTimeout: 30000, // 30 seconds
  keepAliveTimeout: 5000,   // 5 seconds
});

// Per-route timeout
app.get('/long-operation', {
  config: {
    timeout: 60000, // 60 seconds
  },
}, async (request) => {
  return longOperation();
});
```

## Disable Unnecessary Features

Disable features you don't need:

```typescript
import Fastify from 'fastify';

const app = Fastify({
  disableRequestLogging: true, // If you don't need request logs
  trustProxy: false,           // If not behind proxy
  caseSensitive: true,         // Enable for slight performance gain
  ignoreDuplicateSlashes: false,
});
```

## Benchmarking

Use autocannon for load testing:

```bash
# Install
npm install -g autocannon

# Basic benchmark
autocannon http://localhost:3000/api/users

# With options
autocannon -c 100 -d 30 -p 10 http://localhost:3000/api/users
# -c: connections
# -d: duration in seconds
# -p: pipelining factor
```

```typescript
// Programmatic benchmarking
import autocannon from 'autocannon';

const result = await autocannon({
  url: 'http://localhost:3000/api/users',
  connections: 100,
  duration: 30,
  pipelining: 10,
});

console.log(autocannon.printResult(result));
```

## Profiling

Use `@platformatic/flame` for flame graph profiling:

```bash
npx @platformatic/flame app.js
```

This generates an interactive flame graph to identify performance bottlenecks.

## Memory Management

Monitor and optimize memory usage:

```typescript
// Add health endpoint with memory info
app.get('/health', async () => {
  const memory = process.memoryUsage();
  return {
    status: 'ok',
    memory: {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
    },
  };
});

// Avoid memory leaks in closures
app.addHook('onRequest', async (request) => {
  // BAD - holding reference to large object
  const largeData = await loadLargeData();
  request.getData = () => largeData;

  // GOOD - load on demand
  request.getData = () => loadLargeData();
});
```
