---
name: database
description: Database integration with Fastify using official adapters
metadata:
  tags: database, postgres, mysql, mongodb, redis, sql
---

# Database Integration

## Contents

- [Use Official Fastify Database Adapters](#use-official-fastify-database-adapters)
- [PostgreSQL with @fastify/postgres](#postgresql-with-fastifypostgres)
- [MySQL with @fastify/mysql](#mysql-with-fastifymysql)
- [MongoDB with @fastify/mongodb](#mongodb-with-fastifymongodb)
- [Redis with @fastify/redis](#redis-with-fastifyredis)
- [Database as Plugin](#database-as-plugin)
- [Repository Pattern](#repository-pattern)
- [Testing with Database](#testing-with-database)
- [Connection Pool Configuration](#connection-pool-configuration)

## Use Official Fastify Database Adapters

Always use the official Fastify database plugins from the `@fastify` organization. They provide proper connection pooling, encapsulation, and integration with Fastify's lifecycle.

## PostgreSQL with @fastify/postgres

```typescript
import Fastify from 'fastify';
import fastifyPostgres from '@fastify/postgres';

const app = Fastify({ logger: true });

app.register(fastifyPostgres, {
  connectionString: process.env.DATABASE_URL,
});

// Use in routes
app.get('/users', async (request) => {
  const client = await app.pg.connect();
  try {
    const { rows } = await client.query('SELECT * FROM users');
    return rows;
  } finally {
    client.release();
  }
});

// Or use the pool directly for simple queries
app.get('/users/:id', async (request) => {
  const { id } = request.params;
  const { rows } = await app.pg.query(
    'SELECT * FROM users WHERE id = $1',
    [id],
  );
  return rows[0];
});

// Transactions
app.post('/transfer', async (request) => {
  const { fromId, toId, amount } = request.body;
  const client = await app.pg.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
      [amount, fromId],
    );
    await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [amount, toId],
    );
    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
```

## MySQL with @fastify/mysql

```typescript
import Fastify from 'fastify';
import fastifyMysql from '@fastify/mysql';

const app = Fastify({ logger: true });

app.register(fastifyMysql, {
  promise: true,
  connectionString: process.env.MYSQL_URL,
});

app.get('/users', async (request) => {
  const connection = await app.mysql.getConnection();
  try {
    const [rows] = await connection.query('SELECT * FROM users');
    return rows;
  } finally {
    connection.release();
  }
});
```

## MongoDB with @fastify/mongodb

```typescript
import Fastify from 'fastify';
import fastifyMongo from '@fastify/mongodb';

const app = Fastify({ logger: true });

app.register(fastifyMongo, {
  url: process.env.MONGODB_URL,
});

app.get('/users', async (request) => {
  const users = await app.mongo.db
    .collection('users')
    .find({})
    .toArray();
  return users;
});

app.get('/users/:id', async (request) => {
  const { id } = request.params;
  const user = await app.mongo.db
    .collection('users')
    .findOne({ _id: new app.mongo.ObjectId(id) });
  return user;
});

app.post('/users', async (request) => {
  const result = await app.mongo.db
    .collection('users')
    .insertOne(request.body);
  return { id: result.insertedId };
});
```

## Redis with @fastify/redis

```typescript
import Fastify from 'fastify';
import fastifyRedis from '@fastify/redis';

const app = Fastify({ logger: true });

app.register(fastifyRedis, {
  url: process.env.REDIS_URL,
});

// Caching example
app.get('/data/:key', async (request) => {
  const { key } = request.params;

  // Try cache first
  const cached = await app.redis.get(`cache:${key}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch from database
  const data = await fetchFromDatabase(key);

  // Cache for 5 minutes
  await app.redis.setex(`cache:${key}`, 300, JSON.stringify(data));

  return data;
});
```

## Database as Plugin

Encapsulate database access in a plugin:

```typescript
// plugins/database.ts
import fp from 'fastify-plugin';
import fastifyPostgres from '@fastify/postgres';

export default fp(async function databasePlugin(fastify) {
  await fastify.register(fastifyPostgres, {
    connectionString: fastify.config.DATABASE_URL,
  });

  // Add health check
  fastify.decorate('checkDatabaseHealth', async () => {
    try {
      await fastify.pg.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  });
}, {
  name: 'database',
  dependencies: ['config'],
});
```

## Repository Pattern

Abstract database access with repositories:

```typescript
// repositories/user.repository.ts
import type { FastifyInstance } from 'fastify';

export interface User {
  id: string;
  email: string;
  name: string;
}

export function createUserRepository(app: FastifyInstance) {
  return {
    async findById(id: string): Promise<User | null> {
      const { rows } = await app.pg.query(
        'SELECT * FROM users WHERE id = $1',
        [id],
      );
      return rows[0] || null;
    },

    async findByEmail(email: string): Promise<User | null> {
      const { rows } = await app.pg.query(
        'SELECT * FROM users WHERE email = $1',
        [email],
      );
      return rows[0] || null;
    },

    async create(data: Omit<User, 'id'>): Promise<User> {
      const { rows } = await app.pg.query(
        'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *',
        [data.email, data.name],
      );
      return rows[0];
    },

    async update(id: string, data: Partial<User>): Promise<User | null> {
      const fields = Object.keys(data);
      const values = Object.values(data);
      const setClause = fields
        .map((f, i) => `${f} = $${i + 2}`)
        .join(', ');

      const { rows } = await app.pg.query(
        `UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`,
        [id, ...values],
      );
      return rows[0] || null;
    },

    async delete(id: string): Promise<boolean> {
      const { rowCount } = await app.pg.query(
        'DELETE FROM users WHERE id = $1',
        [id],
      );
      return rowCount > 0;
    },
  };
}

// Usage in plugin
import fp from 'fastify-plugin';
import { createUserRepository } from './repositories/user.repository.js';

export default fp(async function repositoriesPlugin(fastify) {
  fastify.decorate('repositories', {
    users: createUserRepository(fastify),
  });
}, {
  name: 'repositories',
  dependencies: ['database'],
});
```

## Testing with Database

Use transactions for test isolation:

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import { build } from './app.js';

describe('User API', () => {
  let app;
  let client;

  beforeEach(async () => {
    app = await build();
    client = await app.pg.connect();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
    await app.close();
  });

  it('should create a user', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'test@example.com', name: 'Test' },
    });

    t.assert.equal(response.statusCode, 201);
  });
});
```

## Connection Pool Configuration

Configure connection pools appropriately:

```typescript
app.register(fastifyPostgres, {
  connectionString: process.env.DATABASE_URL,
  // Pool configuration
  max: 20,                    // Maximum pool size
  idleTimeoutMillis: 30000,   // Close idle clients after 30s
  connectionTimeoutMillis: 5000, // Timeout for new connections
});
```
