---
name: plugins
description: Plugin development and encapsulation in Fastify
metadata:
  tags: plugins, encapsulation, modules, architecture
---

# Plugin Development and Encapsulation

## Contents

- [Understanding Encapsulation](#understanding-encapsulation)
- [Breaking Encapsulation with fastify-plugin](#breaking-encapsulation-with-fastify-plugin)
- [Plugin Registration Order](#plugin-registration-order)
- [Plugin Options](#plugin-options)
- [Plugin Factory Pattern](#plugin-factory-pattern)
- [Plugin Dependencies](#plugin-dependencies)
- [Scoped Plugins for Route Groups](#scoped-plugins-for-route-groups)
- [Prefix Routes with Register](#prefix-routes-with-register)
- [Plugin Metadata](#plugin-metadata)
- [Autoload Plugins](#autoload-plugins)
- [Testing Plugins in Isolation](#testing-plugins-in-isolation)

## Understanding Encapsulation

Fastify's plugin system provides automatic encapsulation. Each plugin creates its own context, isolating decorators, hooks, and plugins registered within it:

```typescript
import Fastify from 'fastify';
import fp from 'fastify-plugin';

const app = Fastify();

// This plugin is encapsulated - its decorators are NOT available to siblings
app.register(async function childPlugin(fastify) {
  fastify.decorate('privateUtil', () => 'only available here');

  // This decorator is only available within this plugin and its children
  fastify.get('/child', async function (request, reply) {
    return this.privateUtil();
  });
});

// This route CANNOT access privateUtil - it's in a different context
app.get('/parent', async function (request, reply) {
  // this.privateUtil is undefined here
  return { status: 'ok' };
});
```

## Breaking Encapsulation with fastify-plugin

Use `fastify-plugin` when you need to share decorators, hooks, or plugins with the parent context:

```typescript
import fp from 'fastify-plugin';

// This plugin's decorators will be available to the parent and siblings
export default fp(async function databasePlugin(fastify, options) {
  const db = await createConnection(options.connectionString);

  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await db.close();
  });
}, {
  name: 'database-plugin',
  dependencies: [], // List plugin dependencies
});
```

## Plugin Registration Order

Plugins are registered in order, but loading is asynchronous. Use `after()` for sequential dependencies:

```typescript
import Fastify from 'fastify';
import databasePlugin from './plugins/database.js';
import authPlugin from './plugins/auth.js';
import routesPlugin from './routes/index.js';

const app = Fastify();

// Database must be ready before auth
app.register(databasePlugin);

// Auth depends on database
app.register(authPlugin);

// Routes depend on both
app.register(routesPlugin);

// Or use after() for explicit sequencing
app.register(databasePlugin).after(() => {
  app.register(authPlugin).after(() => {
    app.register(routesPlugin);
  });
});

await app.ready();
```

## Plugin Options

Always validate and document plugin options:

```typescript
import fp from 'fastify-plugin';

interface CachePluginOptions {
  ttl: number;
  maxSize?: number;
  prefix?: string;
}

export default fp<CachePluginOptions>(async function cachePlugin(fastify, options) {
  const { ttl, maxSize = 1000, prefix = 'cache:' } = options;

  if (typeof ttl !== 'number' || ttl <= 0) {
    throw new Error('Cache plugin requires a positive ttl option');
  }

  const cache = new Map<string, { value: unknown; expires: number }>();

  fastify.decorate('cache', {
    get(key: string): unknown | undefined {
      const item = cache.get(prefix + key);
      if (!item) return undefined;
      if (Date.now() > item.expires) {
        cache.delete(prefix + key);
        return undefined;
      }
      return item.value;
    },
    set(key: string, value: unknown): void {
      if (cache.size >= maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set(prefix + key, { value, expires: Date.now() + ttl });
    },
  });
}, {
  name: 'cache-plugin',
});
```

## Plugin Factory Pattern

Create configurable plugins using factory functions:

```typescript
import fp from 'fastify-plugin';

interface RateLimitOptions {
  max: number;
  timeWindow: number;
}

function createRateLimiter(defaults: Partial<RateLimitOptions> = {}) {
  return fp<RateLimitOptions>(async function rateLimitPlugin(fastify, options) {
    const config = { ...defaults, ...options };

    // Implementation
    fastify.decorate('rateLimit', config);
  }, {
    name: 'rate-limiter',
  });
}

// Usage
app.register(createRateLimiter({ max: 100 }), { timeWindow: 60000 });
```

## Plugin Dependencies

Declare dependencies to ensure proper load order:

```typescript
import fp from 'fastify-plugin';

export default fp(async function authPlugin(fastify) {
  // This plugin requires 'database-plugin' to be loaded first
  if (!fastify.hasDecorator('db')) {
    throw new Error('Auth plugin requires database plugin');
  }

  fastify.decorate('authenticate', async (request) => {
    const user = await fastify.db.users.findByToken(request.headers.authorization);
    return user;
  });
}, {
  name: 'auth-plugin',
  dependencies: ['database-plugin'],
});
```

## Scoped Plugins for Route Groups

Use encapsulation to scope plugins to specific routes:

```typescript
import Fastify from 'fastify';

const app = Fastify();

// Public routes - no auth required
app.register(async function publicRoutes(fastify) {
  fastify.get('/health', async () => ({ status: 'ok' }));
  fastify.get('/docs', async () => ({ version: '1.0.0' }));
});

// Protected routes - auth required
app.register(async function protectedRoutes(fastify) {
  // Auth hook only applies to routes in this plugin
  fastify.addHook('onRequest', async (request, reply) => {
    const token = request.headers.authorization;
    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    request.user = await verifyToken(token);
  });

  fastify.get('/profile', async (request) => {
    return { user: request.user };
  });

  fastify.get('/settings', async (request) => {
    return { settings: await getSettings(request.user.id) };
  });
});
```

## Prefix Routes with Register

Use the `prefix` option to namespace routes:

```typescript
app.register(import('./routes/users.js'), { prefix: '/api/v1/users' });
app.register(import('./routes/posts.js'), { prefix: '/api/v1/posts' });

// In routes/users.js
export default async function userRoutes(fastify) {
  // Becomes /api/v1/users
  fastify.get('/', async () => {
    return { users: [] };
  });

  // Becomes /api/v1/users/:id
  fastify.get('/:id', async (request) => {
    return { user: { id: request.params.id } };
  });
}
```

## Plugin Metadata

Add metadata for documentation and tooling:

```typescript
import fp from 'fastify-plugin';

async function metricsPlugin(fastify) {
  // Implementation
}

export default fp(metricsPlugin, {
  name: 'metrics-plugin',
  fastify: '5.x', // Fastify version compatibility
  dependencies: ['pino-plugin'],
  decorators: {
    fastify: ['db'], // Required decorators
    request: [],
    reply: [],
  },
});
```

## Autoload Plugins

Use `@fastify/autoload` for automatic plugin loading:

```typescript
import Fastify from 'fastify';
import autoload from '@fastify/autoload';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify();

// Load all plugins from the plugins directory
app.register(autoload, {
  dir: join(__dirname, 'plugins'),
  options: { prefix: '/api' },
});

// Load all routes from the routes directory
app.register(autoload, {
  dir: join(__dirname, 'routes'),
  options: { prefix: '/api' },
});
```

## Testing Plugins in Isolation

Test plugins independently:

```typescript
import { describe, it, before, after } from 'node:test';
import Fastify from 'fastify';
import myPlugin from './my-plugin.js';

describe('MyPlugin', () => {
  let app;

  before(async () => {
    app = Fastify();
    app.register(myPlugin, { option: 'value' });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('should decorate fastify instance', (t) => {
    t.assert.ok(app.hasDecorator('myDecorator'));
  });
});
```
