---
name: error-handling
description: Error handling patterns in Fastify
metadata:
  tags: errors, exceptions, error-handler, validation
---

# Error Handling in Fastify

## Contents

- [Default Error Handler](#default-error-handler)
- [Custom Error Classes](#custom-error-classes)
- [Custom Error Handler](#custom-error-handler)
- [Error Response Schema](#error-response-schema)
- [Reply Helpers with @fastify/sensible](#reply-helpers-with-fastifysensible)
- [Async Error Handling](#async-error-handling)
- [Hook Error Handling](#hook-error-handling)
- [Not Found Handler](#not-found-handler)
- [Error Wrapping](#error-wrapping)
- [Validation Error Customization](#validation-error-customization)
- [Error Cause Chain](#error-cause-chain)
- [Plugin-Scoped Error Handlers](#plugin-scoped-error-handlers)
- [Graceful Error Recovery](#graceful-error-recovery)

## Default Error Handler

Fastify has a built-in error handler. Thrown errors automatically become HTTP responses:

```typescript
import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/users/:id', async (request) => {
  const user = await findUser(request.params.id);
  if (!user) {
    // Throwing an error with statusCode sets the response status
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  return user;
});
```

## Custom Error Classes

Use `@fastify/error` for creating typed errors:

```typescript
import createError from '@fastify/error';

const NotFoundError = createError('NOT_FOUND', '%s not found', 404);
const UnauthorizedError = createError('UNAUTHORIZED', 'Authentication required', 401);
const ForbiddenError = createError('FORBIDDEN', 'Access denied: %s', 403);
const ValidationError = createError('VALIDATION_ERROR', '%s', 400);
const ConflictError = createError('CONFLICT', '%s already exists', 409);

// Usage
app.get('/users/:id', async (request) => {
  const user = await findUser(request.params.id);
  if (!user) {
    throw new NotFoundError('User');
  }
  return user;
});

app.post('/users', async (request) => {
  const exists = await userExists(request.body.email);
  if (exists) {
    throw new ConflictError('Email');
  }
  return createUser(request.body);
});
```

## Custom Error Handler

Implement a centralized error handler:

```typescript
import Fastify from 'fastify';
import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

const app = Fastify({ logger: true });

app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  // Log the error
  request.log.error({ err: error }, 'Request error');

  // Handle validation errors
  if (error.validation) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      details: error.validation,
    });
  }

  // Handle known errors with status codes
  const statusCode = error.statusCode ?? 500;
  const code = error.code ?? 'INTERNAL_ERROR';

  // Don't expose internal error details in production
  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : error.message;

  return reply.code(statusCode).send({
    statusCode,
    error: code,
    message,
  });
});
```

## Error Response Schema

Define consistent error response schemas:

```typescript
app.addSchema({
  $id: 'httpError',
  type: 'object',
  properties: {
    statusCode: { type: 'integer' },
    error: { type: 'string' },
    message: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
  required: ['statusCode', 'error', 'message'],
});

// Use in route schemas
app.get('/users/:id', {
  schema: {
    params: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    response: {
      200: { $ref: 'user#' },
      404: { $ref: 'httpError#' },
      500: { $ref: 'httpError#' },
    },
  },
}, handler);
```

## Reply Helpers with @fastify/sensible

Use `@fastify/sensible` for standard HTTP errors:

```typescript
import fastifySensible from '@fastify/sensible';

app.register(fastifySensible);

app.get('/users/:id', async (request, reply) => {
  const user = await findUser(request.params.id);
  if (!user) {
    return reply.notFound('User not found');
  }
  if (!hasAccess(request.user, user)) {
    return reply.forbidden('You cannot access this user');
  }
  return user;
});

// Available methods:
// reply.badRequest(message?)
// reply.unauthorized(message?)
// reply.forbidden(message?)
// reply.notFound(message?)
// reply.methodNotAllowed(message?)
// reply.conflict(message?)
// reply.gone(message?)
// reply.unprocessableEntity(message?)
// reply.tooManyRequests(message?)
// reply.internalServerError(message?)
// reply.notImplemented(message?)
// reply.badGateway(message?)
// reply.serviceUnavailable(message?)
// reply.gatewayTimeout(message?)
```

## Async Error Handling

Errors in async handlers are automatically caught:

```typescript
// Errors are automatically caught and passed to error handler
app.get('/users', async (request) => {
  const users = await db.users.findAll(); // If this throws, error handler catches it
  return users;
});

// Explicit error handling for custom logic
app.get('/users/:id', async (request, reply) => {
  try {
    const user = await db.users.findById(request.params.id);
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }
    return user;
  } catch (error) {
    // Transform database errors
    if (error.code === 'CONNECTION_ERROR') {
      request.log.error({ err: error }, 'Database connection failed');
      return reply.code(503).send({ error: 'Service temporarily unavailable' });
    }
    throw error; // Re-throw for error handler
  }
});
```

## Hook Error Handling

Errors in hooks are handled the same way:

```typescript
app.addHook('onRequest', async (request, reply) => {
  const token = request.headers.authorization;
  if (!token) {
    // This error goes to the error handler
    throw new UnauthorizedError();
  }

  try {
    request.user = await verifyToken(token);
  } catch (error) {
    throw new UnauthorizedError();
  }
});

// Or use reply to send response directly
app.addHook('onRequest', async (request, reply) => {
  if (!request.headers.authorization) {
    reply.code(401).send({ error: 'Unauthorized' });
    return; // Must return to stop processing
  }
});
```

## Not Found Handler

Customize the 404 response:

```typescript
app.setNotFoundHandler(async (request, reply) => {
  return reply.code(404).send({
    statusCode: 404,
    error: 'Not Found',
    message: `Route ${request.method} ${request.url} not found`,
  });
});

// With schema validation
app.setNotFoundHandler({
  preValidation: async (request, reply) => {
    // Pre-validation hook for 404 handler
  },
}, async (request, reply) => {
  return reply.code(404).send({ error: 'Not Found' });
});
```

## Error Wrapping

Wrap external errors with context:

```typescript
import createError from '@fastify/error';

const DatabaseError = createError('DATABASE_ERROR', 'Database operation failed: %s', 500);
const ExternalServiceError = createError('EXTERNAL_SERVICE_ERROR', 'External service failed: %s', 502);

app.get('/users/:id', async (request) => {
  try {
    return await db.users.findById(request.params.id);
  } catch (error) {
    throw new DatabaseError(error.message, { cause: error });
  }
});

app.get('/weather', async (request) => {
  try {
    return await weatherApi.fetch(request.query.city);
  } catch (error) {
    throw new ExternalServiceError(error.message, { cause: error });
  }
});
```

## Validation Error Customization

Customize validation error format:

```typescript
app.setErrorHandler((error, request, reply) => {
  if (error.validation) {
    const details = error.validation.map((err) => {
      const field = err.instancePath
        ? err.instancePath.slice(1).replace(/\//g, '.')
        : err.params?.missingProperty || 'unknown';

      return {
        field,
        message: err.message,
        value: err.data,
      };
    });

    return reply.code(400).send({
      statusCode: 400,
      error: 'Validation Error',
      message: `Invalid ${error.validationContext}: ${details.map(d => d.field).join(', ')}`,
      details,
    });
  }

  // Handle other errors...
  throw error;
});
```

## Error Cause Chain

Preserve error chains for debugging:

```typescript
app.get('/complex-operation', async (request) => {
  try {
    await step1();
  } catch (error) {
    const wrapped = new Error('Step 1 failed', { cause: error });
    wrapped.statusCode = 500;
    throw wrapped;
  }
});

// In error handler, log the full chain
app.setErrorHandler((error, request, reply) => {
  // Log error with cause chain
  let current = error;
  const chain = [];
  while (current) {
    chain.push({
      message: current.message,
      code: current.code,
      stack: current.stack,
    });
    current = current.cause;
  }

  request.log.error({ errorChain: chain }, 'Request failed');

  reply.code(error.statusCode || 500).send({
    error: error.message,
  });
});
```

## Plugin-Scoped Error Handlers

Set error handlers at the plugin level:

```typescript
app.register(async function apiRoutes(fastify) {
  // This error handler only applies to routes in this plugin
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'API error');

    reply.code(error.statusCode || 500).send({
      error: {
        code: error.code || 'API_ERROR',
        message: error.message,
      },
    });
  });

  fastify.get('/data', async () => {
    throw new Error('API-specific error');
  });
}, { prefix: '/api' });
```

## Graceful Error Recovery

Handle errors gracefully without crashing:

```typescript
app.get('/resilient', async (request, reply) => {
  const results = await Promise.allSettled([
    fetchPrimaryData(),
    fetchSecondaryData(),
    fetchOptionalData(),
  ]);

  const [primary, secondary, optional] = results;

  if (primary.status === 'rejected') {
    // Primary data is required
    throw new Error('Primary data unavailable');
  }

  return {
    data: primary.value,
    secondary: secondary.status === 'fulfilled' ? secondary.value : null,
    optional: optional.status === 'fulfilled' ? optional.value : null,
    warnings: results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason.message),
  };
});
```
