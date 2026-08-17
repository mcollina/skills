---
name: serialization
description: Response serialization in Fastify with TypeBox
metadata:
  tags: serialization, response, json, fast-json-stringify, typebox
---

# Response Serialization

## Contents

- [Use TypeBox for Type-Safe Response Schemas](#use-typebox-for-type-safe-response-schemas)
- [Fast JSON Stringify](#fast-json-stringify)
- [Response Schema Benefits](#response-schema-benefits)
- [Multiple Status Code Schemas](#multiple-status-code-schemas)
- [Default Response Schema](#default-response-schema)
- [Custom Serializers](#custom-serializers)
- [Shared Serializers](#shared-serializers)
- [Serialization with Type Coercion](#serialization-with-type-coercion)
- [Nullable Fields](#nullable-fields)
- [Additional Properties](#additional-properties)
- [Nested Objects](#nested-objects)
- [Date Serialization](#date-serialization)
- [BigInt Serialization](#bigint-serialization)
- [Stream Responses](#stream-responses)
- [Pre-Serialization Hook](#pre-serialization-hook)
- [Disable Serialization](#disable-serialization)

## Use TypeBox for Type-Safe Response Schemas

Define response schemas with TypeBox for automatic TypeScript types and fast serialization:

```typescript
import Fastify from 'fastify';
import { Type, type Static } from '@sinclair/typebox';

const app = Fastify();

// Define response schema with TypeBox
const UserResponse = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});

const UsersResponse = Type.Array(UserResponse);

type UserResponseType = Static<typeof UserResponse>;

// With TypeBox schema - uses fast-json-stringify (faster) + TypeScript types
app.get<{ Reply: Static<typeof UsersResponse> }>('/users', {
  schema: {
    response: {
      200: UsersResponse,
    },
  },
}, async () => {
  return db.users.findAll();
});

// Without schema - uses JSON.stringify (slower), no type safety
app.get('/users-slow', async () => {
  return db.users.findAll();
});
```

## Fast JSON Stringify

Fastify uses `fast-json-stringify` when response schemas are defined. This provides:

1. **Performance**: 2-3x faster serialization than JSON.stringify
2. **Security**: Only defined properties are serialized (strips sensitive data)
3. **Type coercion**: Ensures output matches the schema
4. **TypeScript**: Full type inference with TypeBox

## Response Schema Benefits

1. **Performance**: 2-3x faster serialization
2. **Security**: Only defined properties are included
3. **Documentation**: OpenAPI/Swagger integration
4. **Type coercion**: Ensures correct output types

```typescript
app.get('/user/:id', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          // password is NOT in schema, so it's stripped
        },
      },
    },
  },
}, async (request) => {
  const user = await db.users.findById(request.params.id);
  // Even if user has password field, it won't be serialized
  return user;
});
```

## Multiple Status Code Schemas

Define schemas for different response codes:

```typescript
app.get('/users/:id', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
        },
      },
      404: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
}, async (request, reply) => {
  const user = await db.users.findById(request.params.id);

  if (!user) {
    reply.code(404);
    return { statusCode: 404, error: 'Not Found', message: 'User not found' };
  }

  return user;
});
```

## Default Response Schema

Use 'default' for common error responses:

```typescript
app.get('/resource', {
  schema: {
    response: {
      200: { $ref: 'resource#' },
      '4xx': {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
      '5xx': {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          error: { type: 'string' },
        },
      },
    },
  },
}, handler);
```

## Custom Serializers

Create custom serialization functions:

```typescript
// Per-route serializer
app.get('/custom', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      },
    },
  },
  serializerCompiler: ({ schema }) => {
    return (data) => {
      // Custom serialization logic
      return JSON.stringify({
        value: String(data.value).toUpperCase(),
        serializedAt: new Date().toISOString(),
      });
    };
  },
}, async () => {
  return { value: 'hello' };
});
```

## Shared Serializers

Use the global serializer compiler:

```typescript
import Fastify from 'fastify';

const app = Fastify({
  serializerCompiler: ({ schema, method, url, httpStatus }) => {
    // Custom compilation logic
    const stringify = fastJson(schema);
    return (data) => stringify(data);
  },
});
```

## Serialization with Type Coercion

fast-json-stringify coerces types:

```typescript
app.get('/data', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          count: { type: 'integer' },    // '5' -> 5
          active: { type: 'boolean' },   // 'true' -> true
          tags: {
            type: 'array',
            items: { type: 'string' },   // [1, 2] -> ['1', '2']
          },
        },
      },
    },
  },
}, async () => {
  return {
    count: '5',      // Coerced to integer
    active: 'true',  // Coerced to boolean
    tags: [1, 2, 3], // Coerced to strings
  };
});
```

## Nullable Fields

Handle nullable fields properly:

```typescript
app.get('/profile', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          bio: { type: ['string', 'null'] },
          avatar: {
            oneOf: [
              { type: 'string', format: 'uri' },
              { type: 'null' },
            ],
          },
        },
      },
    },
  },
}, async () => {
  return {
    name: 'John',
    bio: null,
    avatar: null,
  };
});
```

## Additional Properties

Control extra properties in response:

```typescript
// Strip additional properties (default)
app.get('/strict', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
}, async () => {
  return { id: '1', name: 'John', secret: 'hidden' };
  // Output: { "id": "1", "name": "John" }
});

// Allow additional properties
app.get('/flexible', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  },
}, async () => {
  return { id: '1', extra: 'included' };
  // Output: { "id": "1", "extra": "included" }
});
```

## Nested Objects

Serialize nested structures:

```typescript
app.addSchema({
  $id: 'address',
  type: 'object',
  properties: {
    street: { type: 'string' },
    city: { type: 'string' },
    country: { type: 'string' },
  },
});

app.get('/user', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { $ref: 'address#' },
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                value: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
}, async () => {
  return {
    name: 'John',
    address: { street: '123 Main', city: 'Boston', country: 'USA' },
    contacts: [
      { type: 'email', value: 'john@example.com' },
      { type: 'phone', value: '+1234567890' },
    ],
  };
});
```

## Date Serialization

Handle dates consistently:

```typescript
app.get('/events', {
  schema: {
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
}, async () => {
  const events = await db.events.findAll();

  // Convert Date objects to ISO strings
  return events.map((e) => ({
    ...e,
    date: e.date.toISOString(),
  }));
});
```

## BigInt Serialization

Handle BigInt values:

```typescript
// BigInt is not JSON serializable by default
app.get('/large-number', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' }, // Serialize as string
          count: { type: 'integer' },
        },
      },
    },
  },
}, async () => {
  const bigValue = 9007199254740993n;

  return {
    id: bigValue.toString(), // Convert to string
    count: Number(bigValue), // Or number if safe
  };
});
```

## Stream Responses

Stream responses bypass serialization:

```typescript
import { createReadStream } from 'node:fs';

app.get('/file', async (request, reply) => {
  const stream = createReadStream('./data.json');
  reply.type('application/json');
  return reply.send(stream);
});

// Streaming JSON array
app.get('/stream', async (request, reply) => {
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

## Pre-Serialization Hook

Modify data before serialization:

```typescript
app.addHook('preSerialization', async (request, reply, payload) => {
  // Add metadata to responses
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...payload,
      _links: {
        self: request.url,
      },
    };
  }
  return payload;
});
```

## Disable Serialization

Skip serialization for specific routes:

```typescript
app.get('/raw', async (request, reply) => {
  const data = JSON.stringify({ raw: true });
  reply.type('application/json');
  reply.serializer((payload) => payload); // Pass through
  return data;
});
```
