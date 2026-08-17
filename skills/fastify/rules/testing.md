---
name: testing
description: Testing Fastify applications with inject()
metadata:
  tags: testing, inject, node-test, integration, unit
---

# Testing Fastify Applications

## Contents

- [Using inject() for Request Testing](#using-inject-for-request-testing)
- [Testing with Headers and Authentication](#testing-with-headers-and-authentication)
- [Testing Query Parameters](#testing-query-parameters)
- [Testing URL Parameters](#testing-url-parameters)
- [Testing Validation Errors](#testing-validation-errors)
- [Testing File Uploads](#testing-file-uploads)
- [Testing Streams](#testing-streams)
- [Mocking Dependencies](#mocking-dependencies)
- [Testing Plugins in Isolation](#testing-plugins-in-isolation)
- [Testing Hooks](#testing-hooks)
- [Test Factory Pattern](#test-factory-pattern)
- [Database Testing with Transactions](#database-testing-with-transactions)
- [Parallel Test Execution](#parallel-test-execution)
- [Running Tests](#running-tests)

## Using inject() for Request Testing

Fastify's `inject()` method simulates HTTP requests without network overhead:

```typescript
import { describe, it, before, after } from 'node:test';
import Fastify from 'fastify';
import { buildApp } from './app.js';

describe('User API', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('should return users list', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/users',
    });

    t.assert.equal(response.statusCode, 200);
    t.assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');

    const body = response.json();
    t.assert.ok(Array.isArray(body.users));
  });

  it('should create a user', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        name: 'John Doe',
        email: 'john@example.com',
      },
    });

    t.assert.equal(response.statusCode, 201);

    const body = response.json();
    t.assert.equal(body.name, 'John Doe');
    t.assert.ok(body.id);
  });
});
```

## Testing with Headers and Authentication

Test authenticated endpoints:

```typescript
describe('Protected Routes', () => {
  let app;
  let authToken;

  before(async () => {
    app = await buildApp();
    await app.ready();

    // Get auth token
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'password123',
      },
    });

    authToken = loginResponse.json().token;
  });

  after(async () => {
    await app.close();
  });

  it('should reject unauthenticated requests', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/profile',
    });

    t.assert.equal(response.statusCode, 401);
  });

  it('should return profile for authenticated user', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    t.assert.equal(response.statusCode, 200);
    t.assert.equal(response.json().email, 'test@example.com');
  });
});
```

## Testing Query Parameters

Test routes with query strings:

```typescript
it('should filter users by status', async (t) => {
  const response = await app.inject({
    method: 'GET',
    url: '/users',
    query: {
      status: 'active',
      page: '1',
      limit: '10',
    },
  });

  t.assert.equal(response.statusCode, 200);
  const body = response.json();
  t.assert.ok(body.users.every((u) => u.status === 'active'));
});

// Or use URL with query string
it('should search users', async (t) => {
  const response = await app.inject({
    method: 'GET',
    url: '/users?q=john&sort=name',
  });

  t.assert.equal(response.statusCode, 200);
});
```

## Testing URL Parameters

Test routes with path parameters:

```typescript
it('should return user by id', async (t) => {
  const userId = 'user-123';

  const response = await app.inject({
    method: 'GET',
    url: `/users/${userId}`,
  });

  t.assert.equal(response.statusCode, 200);
  t.assert.equal(response.json().id, userId);
});

it('should return 404 for non-existent user', async (t) => {
  const response = await app.inject({
    method: 'GET',
    url: '/users/non-existent',
  });

  t.assert.equal(response.statusCode, 404);
});
```

## Testing Validation Errors

Test schema validation:

```typescript
describe('Validation', () => {
  it('should reject invalid email', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        name: 'John',
        email: 'not-an-email',
      },
    });

    t.assert.equal(response.statusCode, 400);
    const body = response.json();
    t.assert.ok(body.message.includes('email'));
  });

  it('should reject missing required fields', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        name: 'John',
        // missing email
      },
    });

    t.assert.equal(response.statusCode, 400);
  });

  it('should coerce query parameters', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/items?limit=10&active=true',
    });

    t.assert.equal(response.statusCode, 200);
    // limit is coerced to number, active to boolean
  });
});
```

## Testing File Uploads

Test multipart form data:

```typescript
import { createReadStream } from 'node:fs';
import FormData from 'form-data';

it('should upload file', async (t) => {
  const form = new FormData();
  form.append('file', createReadStream('./test/fixtures/test.pdf'));
  form.append('name', 'test-document');

  const response = await app.inject({
    method: 'POST',
    url: '/upload',
    payload: form,
    headers: form.getHeaders(),
  });

  t.assert.equal(response.statusCode, 200);
  t.assert.ok(response.json().fileId);
});
```

## Testing Streams

Test streaming responses:

```typescript
it('should stream large file', async (t) => {
  const response = await app.inject({
    method: 'GET',
    url: '/files/large-file',
  });

  t.assert.equal(response.statusCode, 200);
  t.assert.ok(response.rawPayload.length > 0);
});
```

## Mocking Dependencies

Mock external services and databases:

```typescript
import { describe, it, before, after, mock } from 'node:test';

describe('User Service', () => {
  let app;

  before(async () => {
    // Create app with mocked dependencies
    const mockDb = {
      users: {
        findAll: mock.fn(async () => [
          { id: '1', name: 'User 1' },
          { id: '2', name: 'User 2' },
        ]),
        findById: mock.fn(async (id) => {
          if (id === '1') return { id: '1', name: 'User 1' };
          return null;
        }),
        create: mock.fn(async (data) => ({ id: 'new-id', ...data })),
      },
    };

    app = Fastify();
    app.decorate('db', mockDb);
    app.register(import('./routes/users.js'));
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('should call findAll', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/users',
    });

    t.assert.equal(response.statusCode, 200);
    t.assert.equal(app.db.users.findAll.mock.calls.length, 1);
  });
});
```

## Testing Plugins in Isolation

Test plugins independently:

```typescript
import { describe, it, before, after } from 'node:test';
import Fastify from 'fastify';
import cachePlugin from './plugins/cache.js';

describe('Cache Plugin', () => {
  let app;

  before(async () => {
    app = Fastify();
    app.register(cachePlugin, { ttl: 1000 });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('should decorate fastify with cache', (t) => {
    t.assert.ok(app.hasDecorator('cache'));
    t.assert.equal(typeof app.cache.get, 'function');
    t.assert.equal(typeof app.cache.set, 'function');
  });

  it('should cache and retrieve values', (t) => {
    app.cache.set('key', 'value');
    t.assert.equal(app.cache.get('key'), 'value');
  });
});
```

## Testing Hooks

Test hook behavior:

```typescript
describe('Hooks', () => {
  it('should add request id header', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    t.assert.ok(response.headers['x-request-id']);
  });

  it('should log request timing', async (t) => {
    const logs = [];
    const app = Fastify({
      logger: {
        level: 'info',
        stream: {
          write: (msg) => logs.push(JSON.parse(msg)),
        },
      },
    });

    app.register(import('./app.js'));
    await app.ready();

    await app.inject({ method: 'GET', url: '/health' });

    const responseLog = logs.find((l) => l.msg?.includes('completed'));
    t.assert.ok(responseLog);
    t.assert.ok(responseLog.responseTime);

    await app.close();
  });
});
```

## Test Factory Pattern

Create a reusable test app builder:

```typescript
// test/helper.ts
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

interface TestContext {
  app: FastifyInstance;
  inject: FastifyInstance['inject'];
}

export async function buildTestApp(options = {}): Promise<TestContext> {
  const app = Fastify({
    logger: false, // Disable logging in tests
    ...options,
  });

  // Register plugins
  app.register(import('../src/plugins/database.js'), {
    connectionString: process.env.TEST_DATABASE_URL,
  });
  app.register(import('../src/routes/index.js'));

  await app.ready();

  return {
    app,
    inject: app.inject.bind(app),
  };
}

// Usage in tests
describe('API Tests', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await buildTestApp();
  });

  after(async () => {
    await ctx.app.close();
  });

  it('should work', async (t) => {
    const response = await ctx.inject({
      method: 'GET',
      url: '/health',
    });
    t.assert.equal(response.statusCode, 200);
  });
});
```

## Database Testing with Transactions

Use transactions for test isolation:

```typescript
describe('Database Integration', () => {
  let app;
  let transaction;

  before(async () => {
    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  beforeEach(async () => {
    transaction = await app.db.beginTransaction();
    app.db.setTransaction(transaction);
  });

  afterEach(async () => {
    await transaction.rollback();
  });

  it('should create user', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'Test', email: 'test@example.com' },
    });

    t.assert.equal(response.statusCode, 201);
    // Transaction is rolled back after test
  });
});
```

## Parallel Test Execution

Structure tests for parallel execution:

```typescript
// Tests run in parallel by default with node:test
// Use separate app instances or proper isolation

import { describe, it } from 'node:test';

describe('User API', async () => {
  // Each test suite gets its own app instance
  const app = await buildTestApp();

  it('test 1', async (t) => {
    // ...
  });

  it('test 2', async (t) => {
    // ...
  });

  // Cleanup after all tests in this suite
  after(() => app.close());
});

describe('Post API', async () => {
  const app = await buildTestApp();

  it('test 1', async (t) => {
    // ...
  });

  after(() => app.close());
});
```

## Running Tests

```bash
# Run all tests
node --test

# Run with TypeScript
node --test src/**/*.test.ts

# Run specific file
node --test src/routes/users.test.ts

# With coverage
node --test --experimental-test-coverage

# Watch mode
node --test --watch
```
