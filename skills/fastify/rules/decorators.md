---
name: decorators
description: Decorators and request/reply extensions in Fastify
metadata:
  tags: decorators, extensions, customization, utilities
---

# Decorators and Extensions

## Contents

- [Understanding Decorators](#understanding-decorators)
- [Decorator Types](#decorator-types)
- [TypeScript Declaration Merging](#typescript-declaration-merging)
- [Decorator Initialization](#decorator-initialization)
- [Dependency Injection with Decorators](#dependency-injection-with-decorators)
- [Request Context Pattern](#request-context-pattern)
- [Reply Helpers](#reply-helpers)
- [Checking Decorators](#checking-decorators)
- [Decorator Encapsulation](#decorator-encapsulation)
- [Functional Decorators](#functional-decorators)
- [Async Decorator Initialization](#async-decorator-initialization)

## Understanding Decorators

Decorators add custom properties and methods to Fastify instances, requests, and replies:

```typescript
import Fastify from 'fastify';

const app = Fastify();

// Decorate the Fastify instance
app.decorate('utility', {
  formatDate: (date: Date) => date.toISOString(),
  generateId: () => crypto.randomUUID(),
});

// Use in routes
app.get('/example', async function (request, reply) {
  const id = this.utility.generateId();
  return { id, timestamp: this.utility.formatDate(new Date()) };
});
```

## Decorator Types

Three types of decorators for different contexts:

```typescript
// Instance decorator - available on fastify instance
app.decorate('config', { apiVersion: '1.0.0' });
app.decorate('db', databaseConnection);
app.decorate('cache', cacheClient);

// Request decorator - available on each request
app.decorateRequest('user', null);           // Object property
app.decorateRequest('startTime', 0);         // Primitive
app.decorateRequest('getData', function() {  // Method
  return this.body;
});

// Reply decorator - available on each reply
app.decorateReply('sendError', function(code: number, message: string) {
  return this.code(code).send({ error: message });
});
app.decorateReply('success', function(data: unknown) {
  return this.send({ success: true, data });
});
```

## TypeScript Declaration Merging

Extend Fastify types for type safety:

```typescript
// Declare custom properties
declare module 'fastify' {
  interface FastifyInstance {
    config: {
      apiVersion: string;
      environment: string;
    };
    db: DatabaseClient;
    cache: CacheClient;
  }

  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      roles: string[];
    } | null;
    startTime: number;
    requestId: string;
  }

  interface FastifyReply {
    sendError: (code: number, message: string) => void;
    success: (data: unknown) => void;
  }
}

// Register decorators
app.decorate('config', {
  apiVersion: '1.0.0',
  environment: process.env.NODE_ENV,
});

app.decorateRequest('user', null);
app.decorateRequest('startTime', 0);

app.decorateReply('sendError', function (code: number, message: string) {
  this.code(code).send({ error: message });
});
```

## Decorator Initialization

Initialize request/reply decorators in hooks:

```typescript
// Decorators with primitive defaults are copied
app.decorateRequest('startTime', 0);

// Initialize in hook
app.addHook('onRequest', async (request) => {
  request.startTime = Date.now();
});

// Object decorators need getter pattern for proper initialization
app.decorateRequest('context', null);

app.addHook('onRequest', async (request) => {
  request.context = {
    traceId: request.headers['x-trace-id'] || crypto.randomUUID(),
    clientIp: request.ip,
    userAgent: request.headers['user-agent'],
  };
});
```

## Dependency Injection with Decorators

Use decorators for dependency injection:

```typescript
import fp from 'fastify-plugin';

// Database plugin
export default fp(async function databasePlugin(fastify, options) {
  const db = await createDatabaseConnection(options.connectionString);

  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await db.close();
  });
});

// User service plugin
export default fp(async function userServicePlugin(fastify) {
  // Depends on db decorator
  if (!fastify.hasDecorator('db')) {
    throw new Error('Database plugin must be registered first');
  }

  const userService = {
    findById: (id: string) => fastify.db.query('SELECT * FROM users WHERE id = $1', [id]),
    create: (data: CreateUserInput) => fastify.db.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [data.name, data.email]
    ),
  };

  fastify.decorate('userService', userService);
}, {
  dependencies: ['database-plugin'],
});

// Use in routes
app.get('/users/:id', async function (request) {
  const user = await this.userService.findById(request.params.id);
  return user;
});
```

## Request Context Pattern

Build rich request context:

```typescript
interface RequestContext {
  traceId: string;
  user: User | null;
  permissions: Set<string>;
  startTime: number;
  metadata: Map<string, unknown>;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

app.decorateRequest('ctx', null);

app.addHook('onRequest', async (request) => {
  request.ctx = {
    traceId: request.headers['x-trace-id']?.toString() || crypto.randomUUID(),
    user: null,
    permissions: new Set(),
    startTime: Date.now(),
    metadata: new Map(),
  };
});

// Auth hook populates user
app.addHook('preHandler', async (request) => {
  const token = request.headers.authorization;
  if (token) {
    const user = await verifyToken(token);
    request.ctx.user = user;
    request.ctx.permissions = new Set(user.permissions);
  }
});

// Use in handlers
app.get('/profile', async (request, reply) => {
  if (!request.ctx.user) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  if (!request.ctx.permissions.has('read:profile')) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  return request.ctx.user;
});
```

## Reply Helpers

Create consistent response methods:

```typescript
declare module 'fastify' {
  interface FastifyReply {
    ok: (data?: unknown) => void;
    created: (data: unknown) => void;
    noContent: () => void;
    badRequest: (message: string, details?: unknown) => void;
    unauthorized: (message?: string) => void;
    forbidden: (message?: string) => void;
    notFound: (resource?: string) => void;
    conflict: (message: string) => void;
    serverError: (message?: string) => void;
  }
}

app.decorateReply('ok', function (data?: unknown) {
  this.code(200).send(data ?? { success: true });
});

app.decorateReply('created', function (data: unknown) {
  this.code(201).send(data);
});

app.decorateReply('noContent', function () {
  this.code(204).send();
});

app.decorateReply('badRequest', function (message: string, details?: unknown) {
  this.code(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message,
    details,
  });
});

app.decorateReply('unauthorized', function (message = 'Authentication required') {
  this.code(401).send({
    statusCode: 401,
    error: 'Unauthorized',
    message,
  });
});

app.decorateReply('notFound', function (resource = 'Resource') {
  this.code(404).send({
    statusCode: 404,
    error: 'Not Found',
    message: `${resource} not found`,
  });
});

// Usage
app.get('/users/:id', async (request, reply) => {
  const user = await db.users.findById(request.params.id);
  if (!user) {
    return reply.notFound('User');
  }
  return reply.ok(user);
});

app.post('/users', async (request, reply) => {
  const user = await db.users.create(request.body);
  return reply.created(user);
});
```

## Checking Decorators

Check if decorators exist before using:

```typescript
// Check at registration time
app.register(async function (fastify) {
  if (!fastify.hasDecorator('db')) {
    throw new Error('Database decorator required');
  }

  if (!fastify.hasRequestDecorator('user')) {
    throw new Error('User request decorator required');
  }

  if (!fastify.hasReplyDecorator('sendError')) {
    throw new Error('sendError reply decorator required');
  }

  // Safe to use decorators
});
```

## Decorator Encapsulation

Decorators respect encapsulation by default:

```typescript
app.register(async function pluginA(fastify) {
  fastify.decorate('pluginAUtil', () => 'A');

  fastify.get('/a', async function () {
    return this.pluginAUtil(); // Works
  });
});

app.register(async function pluginB(fastify) {
  // this.pluginAUtil is NOT available here (encapsulated)

  fastify.get('/b', async function () {
    // this.pluginAUtil() would be undefined
  });
});
```

Use `fastify-plugin` to share decorators:

```typescript
import fp from 'fastify-plugin';

export default fp(async function sharedDecorator(fastify) {
  fastify.decorate('sharedUtil', () => 'shared');
});

// Now available to parent and sibling plugins
```

## Functional Decorators

Create decorators that return functions:

```typescript
declare module 'fastify' {
  interface FastifyInstance {
    createValidator: <T>(schema: object) => (data: unknown) => T;
    createRateLimiter: (options: RateLimitOptions) => RateLimiter;
  }
}

app.decorate('createValidator', function <T>(schema: object) {
  const validate = ajv.compile(schema);
  return (data: unknown): T => {
    if (!validate(data)) {
      throw new ValidationError(validate.errors);
    }
    return data as T;
  };
});

// Usage
const validateUser = app.createValidator<User>(userSchema);

app.post('/users', async (request) => {
  const user = validateUser(request.body);
  return db.users.create(user);
});
```

## Async Decorator Initialization

Handle async initialization properly:

```typescript
import fp from 'fastify-plugin';

export default fp(async function asyncPlugin(fastify) {
  // Async initialization
  const connection = await createAsyncConnection();
  const cache = await initializeCache();

  fastify.decorate('asyncService', {
    connection,
    cache,
    query: async (sql: string) => connection.query(sql),
  });

  fastify.addHook('onClose', async () => {
    await connection.close();
    await cache.disconnect();
  });
});

// Plugin is fully initialized before routes execute
app.get('/data', async function () {
  return this.asyncService.query('SELECT * FROM data');
});
```
