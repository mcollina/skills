---
name: routes
description: Route organization and handlers in Fastify
metadata:
  tags: routes, handlers, http, rest, api
---

# Route Organization and Handlers

## Contents

- [Basic Route Definition](#basic-route-definition)
- [Route Parameters](#route-parameters)
- [Query String Parameters](#query-string-parameters)
- [Request Body](#request-body)
- [Headers](#headers)
- [Reply Methods](#reply-methods)
- [Route Organization by Feature](#route-organization-by-feature)
- [Route Constraints](#route-constraints)
- [Route Prefixing](#route-prefixing)
- [Multiple Methods](#multiple-methods)
- [404 Handler](#404-handler)
- [Method Not Allowed](#method-not-allowed)
- [Route-Level Configuration](#route-level-configuration)
- [Async Route Registration](#async-route-registration)
- [Auto-loading Routes with @fastify/autoload](#auto-loading-routes-with-fastifyautoload)

## Basic Route Definition

Define routes with the shorthand methods or the full route method:

```typescript
import Fastify from 'fastify';

const app = Fastify();

// Shorthand methods
app.get('/users', async (request, reply) => {
  return { users: [] };
});

app.post('/users', async (request, reply) => {
  return { created: true };
});

// Full route method with all options
app.route({
  method: 'GET',
  url: '/users/:id',
  schema: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  handler: async (request, reply) => {
    return { id: request.params.id };
  },
});
```

## Route Parameters

Access URL parameters through `request.params`:

```typescript
// Single parameter
app.get('/users/:id', async (request) => {
  const { id } = request.params as { id: string };
  return { userId: id };
});

// Multiple parameters
app.get('/users/:userId/posts/:postId', async (request) => {
  const { userId, postId } = request.params as { userId: string; postId: string };
  return { userId, postId };
});

// Wildcard parameter (captures everything after)
app.get('/files/*', async (request) => {
  const path = (request.params as { '*': string })['*'];
  return { filePath: path };
});

// Regex parameters (Fastify uses find-my-way)
app.get('/orders/:id(\\d+)', async (request) => {
  // Only matches numeric IDs
  const { id } = request.params as { id: string };
  return { orderId: parseInt(id, 10) };
});
```

## Query String Parameters

Access query parameters through `request.query`:

```typescript
app.get('/search', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        page: { type: 'integer', default: 1 },
        limit: { type: 'integer', default: 10, maximum: 100 },
      },
      required: ['q'],
    },
  },
  handler: async (request) => {
    const { q, page, limit } = request.query as {
      q: string;
      page: number;
      limit: number;
    };
    return { query: q, page, limit };
  },
});
```

## Request Body

Access the request body through `request.body`:

```typescript
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        email: { type: 'string', format: 'email' },
        age: { type: 'integer', minimum: 0 },
      },
      required: ['name', 'email'],
    },
  },
  handler: async (request, reply) => {
    const user = request.body as { name: string; email: string; age?: number };
    // Create user...
    reply.code(201);
    return { user };
  },
});
```

## Headers

Access request headers through `request.headers`:

```typescript
app.get('/protected', {
  schema: {
    headers: {
      type: 'object',
      properties: {
        authorization: { type: 'string' },
      },
      required: ['authorization'],
    },
  },
  handler: async (request) => {
    const token = request.headers.authorization;
    return { authenticated: true };
  },
});
```

## Reply Methods

Use reply methods to control the response:

```typescript
app.get('/examples', async (request, reply) => {
  // Set status code
  reply.code(201);

  // Set headers
  reply.header('X-Custom-Header', 'value');
  reply.headers({ 'X-Another': 'value', 'X-Third': 'value' });

  // Set content type
  reply.type('application/json');

  // Redirect
  // reply.redirect('/other-url');
  // reply.redirect(301, '/permanent-redirect');

  // Return response (automatic serialization)
  return { status: 'ok' };
});

// Explicit send (useful in non-async handlers)
app.get('/explicit', (request, reply) => {
  reply.send({ status: 'ok' });
});

// Stream response
app.get('/stream', async (request, reply) => {
  const stream = fs.createReadStream('./large-file.txt');
  reply.type('text/plain');
  return reply.send(stream);
});
```

## Route Organization by Feature

Organize routes by feature/domain in separate files:

```
src/
  routes/
    users/
      index.ts       # Route definitions
      handlers.ts    # Handler functions
      schemas.ts     # JSON schemas
    posts/
      index.ts
      handlers.ts
      schemas.ts
```

```typescript
// routes/users/schemas.ts
export const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
  },
};

export const createUserSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      email: { type: 'string', format: 'email' },
    },
    required: ['name', 'email'],
  },
  response: {
    201: userSchema,
  },
};

// routes/users/handlers.ts
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function createUser(
  request: FastifyRequest<{ Body: { name: string; email: string } }>,
  reply: FastifyReply,
) {
  const { name, email } = request.body;
  const user = await request.server.db.users.create({ name, email });
  reply.code(201);
  return user;
}

export async function getUsers(request: FastifyRequest) {
  return request.server.db.users.findAll();
}

// routes/users/index.ts
import type { FastifyInstance } from 'fastify';
import { createUser, getUsers } from './handlers.js';
import { createUserSchema } from './schemas.js';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/', getUsers);
  fastify.post('/', { schema: createUserSchema }, createUser);
}
```

## Route Constraints

Add constraints to routes for versioning or host-based routing:

```typescript
// Version constraint
app.get('/users', {
  constraints: { version: '1.0.0' },
  handler: async () => ({ version: '1.0.0', users: [] }),
});

app.get('/users', {
  constraints: { version: '2.0.0' },
  handler: async () => ({ version: '2.0.0', data: { users: [] } }),
});

// Client sends: Accept-Version: 1.0.0

// Host constraint
app.get('/', {
  constraints: { host: 'api.example.com' },
  handler: async () => ({ api: true }),
});

app.get('/', {
  constraints: { host: 'www.example.com' },
  handler: async () => ({ web: true }),
});
```

## Route Prefixing

Use prefixes to namespace routes:

```typescript
// Using register
app.register(async function (fastify) {
  fastify.get('/list', async () => ({ users: [] }));
  fastify.get('/:id', async (request) => ({ id: request.params.id }));
}, { prefix: '/users' });

// Results in:
// GET /users/list
// GET /users/:id
```

## Multiple Methods

Handle multiple HTTP methods with one handler:

```typescript
app.route({
  method: ['GET', 'HEAD'],
  url: '/resource',
  handler: async (request) => {
    return { data: 'resource' };
  },
});
```

## 404 Handler

Customize the not found handler:

```typescript
app.setNotFoundHandler({
  preValidation: async (request, reply) => {
    // Optional pre-validation hook
  },
  preHandler: async (request, reply) => {
    // Optional pre-handler hook
  },
}, async (request, reply) => {
  reply.code(404);
  return {
    error: 'Not Found',
    message: `Route ${request.method} ${request.url} not found`,
    statusCode: 404,
  };
});
```

## Method Not Allowed

Handle method not allowed responses:

```typescript
// Fastify doesn't have built-in 405 handling
// Implement with a custom not found handler that checks allowed methods
app.setNotFoundHandler(async (request, reply) => {
  // Check if the URL exists with a different method
  const route = app.hasRoute({
    url: request.url,
    method: 'GET', // Check other methods
  });

  if (route) {
    reply.code(405);
    return { error: 'Method Not Allowed' };
  }

  reply.code(404);
  return { error: 'Not Found' };
});
```

## Route-Level Configuration

Apply configuration to specific routes:

```typescript
app.get('/slow-operation', {
  config: {
    rateLimit: { max: 10, timeWindow: '1 minute' },
  },
  handler: async (request) => {
    return { result: await slowOperation() };
  },
});

// Access config in hooks
app.addHook('onRequest', async (request, reply) => {
  const config = request.routeOptions.config;
  if (config.rateLimit) {
    // Apply rate limiting
  }
});
```

## Async Route Registration

Register routes from async sources:

```typescript
app.register(async function (fastify) {
  const routeConfigs = await loadRoutesFromDatabase();

  for (const config of routeConfigs) {
    fastify.route({
      method: config.method,
      url: config.path,
      handler: createDynamicHandler(config),
    });
  }
});
```

## Auto-loading Routes with @fastify/autoload

Use `@fastify/autoload` to automatically load routes from a directory structure:

```typescript
import Fastify from 'fastify';
import autoload from '@fastify/autoload';
import { join } from 'node:path';

const app = Fastify({ logger: true });

// Auto-load plugins
app.register(autoload, {
  dir: join(import.meta.dirname, 'plugins'),
  options: { prefix: '' },
});

// Auto-load routes
app.register(autoload, {
  dir: join(import.meta.dirname, 'routes'),
  options: { prefix: '/api' },
});

await app.listen({ port: 3000 });
```

Directory structure:

```
src/
  plugins/
    database.ts     # Loaded automatically
    auth.ts         # Loaded automatically
  routes/
    users/
      index.ts      # GET/POST /api/users
      _id/
        index.ts    # GET/PUT/DELETE /api/users/:id
    posts/
      index.ts      # GET/POST /api/posts
```

Route file example:

```typescript
// routes/users/index.ts
import type { FastifyPluginAsync } from 'fastify';

const users: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => {
    return fastify.repositories.users.findAll();
  });

  fastify.post('/', async (request) => {
    return fastify.repositories.users.create(request.body);
  });
};

export default users;
```
