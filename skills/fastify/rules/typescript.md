---
name: typescript
description: TypeScript integration with Fastify
metadata:
  tags: typescript, types, generics, type-safety
---

# TypeScript Integration

## Contents

- [Type Stripping with Node.js](#type-stripping-with-nodejs)
- [Basic Type Safety](#basic-type-safety)
- [Typing Route Handlers](#typing-route-handlers)
- [Type Providers](#type-providers)
- [Typing Decorators](#typing-decorators)
- [Typing Plugins](#typing-plugins)
- [Typing Hooks](#typing-hooks)
- [Typing Schema Objects](#typing-schema-objects)
- [Shared Types](#shared-types)
- [Type-Safe Route Registration](#type-safe-route-registration)
- [Avoiding Type Gymnastics](#avoiding-type-gymnastics)
- [Type Checking Without Compilation](#type-checking-without-compilation)

## Type Stripping with Node.js

Use Node.js built-in type stripping (Node.js 22.6+):

```bash
# Run TypeScript directly
node --experimental-strip-types app.ts

# In Node.js 23+
node app.ts
```

```json
// package.json
{
  "type": "module",
  "scripts": {
    "start": "node app.ts",
    "dev": "node --watch app.ts"
  }
}
```

```typescript
// tsconfig.json for type stripping
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "noEmit": true,
    "strict": true
  }
}
```

## Basic Type Safety

Type your Fastify application:

```typescript
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';

const app: FastifyInstance = Fastify({ logger: true });

app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
  return { status: 'ok' };
});

await app.listen({ port: 3000 });
```

## Typing Route Handlers

Use generics to type request parts:

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';

interface CreateUserBody {
  name: string;
  email: string;
}

interface UserParams {
  id: string;
}

interface UserQuery {
  include?: string;
}

// Type the request with generics
app.post<{
  Body: CreateUserBody;
}>('/users', async (request, reply) => {
  const { name, email } = request.body; // Fully typed
  return { name, email };
});

app.get<{
  Params: UserParams;
  Querystring: UserQuery;
}>('/users/:id', async (request) => {
  const { id } = request.params;         // string
  const { include } = request.query;      // string | undefined
  return { id, include };
});

// Full route options typing
app.route<{
  Params: UserParams;
  Querystring: UserQuery;
  Body: CreateUserBody;
  Reply: { user: { id: string; name: string } };
}>({
  method: 'PUT',
  url: '/users/:id',
  handler: async (request, reply) => {
    return { user: { id: request.params.id, name: request.body.name } };
  },
});
```

## Type Providers

Use @fastify/type-provider-typebox for runtime + compile-time safety:

```typescript
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';

const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();

const UserSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String({ format: 'email' }),
});

const CreateUserSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  email: Type.String({ format: 'email' }),
});

app.post('/users', {
  schema: {
    body: CreateUserSchema,
    response: {
      201: UserSchema,
    },
  },
}, async (request, reply) => {
  // request.body is typed as { name: string; email: string }
  const { name, email } = request.body;

  reply.code(201);
  return { id: 'generated', name, email };
});
```

## Typing Decorators

Extend Fastify types with declaration merging:

```typescript
import Fastify from 'fastify';

// Declare types for decorators
declare module 'fastify' {
  interface FastifyInstance {
    config: {
      port: number;
      host: string;
    };
    db: Database;
  }

  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      role: string;
    };
    startTime: number;
  }

  interface FastifyReply {
    sendSuccess: (data: unknown) => void;
  }
}

const app = Fastify();

// Add decorators
app.decorate('config', { port: 3000, host: 'localhost' });
app.decorate('db', new Database());

app.decorateRequest('user', null);
app.decorateRequest('startTime', 0);

app.decorateReply('sendSuccess', function (data: unknown) {
  this.send({ success: true, data });
});

// Now fully typed
app.get('/profile', async (request, reply) => {
  const user = request.user; // { id: string; email: string; role: string } | undefined
  const config = app.config;  // { port: number; host: string }

  reply.sendSuccess({ user });
});
```

## Typing Plugins

Type plugin options and exports:

```typescript
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

interface DatabasePluginOptions {
  connectionString: string;
  poolSize?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: {
      query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
      close: () => Promise<void>;
    };
  }
}

const databasePlugin: FastifyPluginAsync<DatabasePluginOptions> = async (
  fastify,
  options,
) => {
  const { connectionString, poolSize = 10 } = options;

  const db = await createConnection(connectionString, poolSize);

  fastify.decorate('db', {
    query: (sql: string, params?: unknown[]) => db.query(sql, params),
    close: () => db.end(),
  });

  fastify.addHook('onClose', async () => {
    await db.end();
  });
};

export default fp(databasePlugin, {
  name: 'database',
});
```

## Typing Hooks

Type hook functions:

```typescript
import type {
  FastifyRequest,
  FastifyReply,
  onRequestHookHandler,
  preHandlerHookHandler,
} from 'fastify';

const authHook: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const token = request.headers.authorization;
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  request.user = await verifyToken(token);
};

const timingHook: onRequestHookHandler = async (request) => {
  request.startTime = Date.now();
};

app.addHook('onRequest', timingHook);
app.addHook('preHandler', authHook);
```

## Typing Schema Objects

Create reusable typed schemas:

```typescript
import type { JSONSchema7 } from 'json-schema';

// Define schema with const assertion for type inference
const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
  },
  required: ['id', 'name', 'email'],
} as const satisfies JSONSchema7;

// Infer TypeScript type from schema
type User = {
  id: string;
  name: string;
  email: string;
};

app.get<{ Reply: User }>('/users/:id', {
  schema: {
    response: {
      200: userSchema,
    },
  },
}, async (request) => {
  return { id: '1', name: 'John', email: 'john@example.com' };
});
```

## Shared Types

Organize types in dedicated files:

```typescript
// types/index.ts
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

export interface CreateUserInput {
  name: string;
  email: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
}

// routes/users.ts
import type { FastifyInstance } from 'fastify';
import type { User, CreateUserInput, PaginationQuery } from '../types/index.js';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: PaginationQuery;
    Reply: { users: User[]; total: number };
  }>('/', async (request) => {
    const { page = 1, limit = 10 } = request.query;
    // ...
  });

  fastify.post<{
    Body: CreateUserInput;
    Reply: User;
  }>('/', async (request, reply) => {
    reply.code(201);
    // ...
  });
}
```

## Type-Safe Route Registration

Create typed route factories:

```typescript
import type { FastifyInstance, RouteOptions } from 'fastify';

function createCrudRoutes<T extends { id: string }>(
  fastify: FastifyInstance,
  options: {
    prefix: string;
    schema: {
      item: object;
      create: object;
      update: object;
    };
    handlers: {
      list: () => Promise<T[]>;
      get: (id: string) => Promise<T | null>;
      create: (data: unknown) => Promise<T>;
      update: (id: string, data: unknown) => Promise<T>;
      delete: (id: string) => Promise<void>;
    };
  },
) {
  const { prefix, schema, handlers } = options;

  fastify.get(`${prefix}`, {
    schema: { response: { 200: { type: 'array', items: schema.item } } },
  }, async () => handlers.list());

  fastify.get(`${prefix}/:id`, {
    schema: { response: { 200: schema.item } },
  }, async (request) => {
    const item = await handlers.get((request.params as { id: string }).id);
    if (!item) throw { statusCode: 404, message: 'Not found' };
    return item;
  });

  // ... more routes
}
```

## Avoiding Type Gymnastics

Keep types simple and practical:

```typescript
// GOOD - simple, readable types
interface UserRequest {
  Params: { id: string };
  Body: { name: string };
}

app.put<UserRequest>('/users/:id', handler);

// AVOID - overly complex generic types
type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;

// AVOID - excessive type inference
type InferSchemaType<T> = T extends { properties: infer P }
  ? { [K in keyof P]: InferPropertyType<P[K]> }
  : never;
```

## Type Checking Without Compilation

Use TypeScript for type checking only:

```bash
# Type check without emitting
npx tsc --noEmit

# Watch mode
npx tsc --noEmit --watch

# In CI
npm run typecheck
```

```json
// package.json
{
  "scripts": {
    "start": "node app.ts",
    "typecheck": "tsc --noEmit",
    "test": "npm run typecheck && node --test"
  }
}
```
