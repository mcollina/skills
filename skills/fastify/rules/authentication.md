---
name: authentication
description: Authentication and authorization patterns in Fastify
metadata:
  tags: auth, jwt, session, oauth, security, authorization
---

# Authentication and Authorization

## Contents

- [JWT Authentication with @fastify/jwt](#jwt-authentication-with-fastifyjwt)
- [Refresh Tokens](#refresh-tokens)
- [Role-Based Access Control](#role-based-access-control)
- [Permission-Based Authorization](#permission-based-authorization)
- [API Key / Bearer Token Authentication](#api-key--bearer-token-authentication)
- [OAuth 2.0 Integration](#oauth-20-integration)
- [Session-Based Authentication](#session-based-authentication)
- [Resource-Based Authorization](#resource-based-authorization)
- [Password Hashing](#password-hashing)
- [Rate Limiting for Auth Endpoints](#rate-limiting-for-auth-endpoints)

## JWT Authentication with @fastify/jwt

Use `@fastify/jwt` for JSON Web Token authentication:

```typescript
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';

const app = Fastify();

app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
  sign: {
    expiresIn: '1h',
  },
});

// Decorate request with authentication method
app.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// Login route
app.post('/login', {
  schema: {
    body: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
      },
      required: ['email', 'password'],
    },
  },
}, async (request, reply) => {
  const { email, password } = request.body;
  const user = await validateCredentials(email, password);

  if (!user) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }

  const token = app.jwt.sign({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  return { token };
});

// Protected route
app.get('/profile', {
  onRequest: [app.authenticate],
}, async (request) => {
  return { user: request.user };
});
```

## Refresh Tokens

Implement refresh token rotation:

```typescript
import fastifyJwt from '@fastify/jwt';
import { randomBytes } from 'node:crypto';

app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
  sign: {
    expiresIn: '15m', // Short-lived access tokens
  },
});

// Store refresh tokens (use Redis in production)
const refreshTokens = new Map<string, { userId: string; expires: number }>();

app.post('/auth/login', async (request, reply) => {
  const { email, password } = request.body;
  const user = await validateCredentials(email, password);

  if (!user) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }

  const accessToken = app.jwt.sign({ id: user.id, role: user.role });
  const refreshToken = randomBytes(32).toString('hex');

  refreshTokens.set(refreshToken, {
    userId: user.id,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return { accessToken, refreshToken };
});

app.post('/auth/refresh', async (request, reply) => {
  const { refreshToken } = request.body;
  const stored = refreshTokens.get(refreshToken);

  if (!stored || stored.expires < Date.now()) {
    refreshTokens.delete(refreshToken);
    return reply.code(401).send({ error: 'Invalid refresh token' });
  }

  // Delete old token (rotation)
  refreshTokens.delete(refreshToken);

  const user = await db.users.findById(stored.userId);
  const accessToken = app.jwt.sign({ id: user.id, role: user.role });
  const newRefreshToken = randomBytes(32).toString('hex');

  refreshTokens.set(newRefreshToken, {
    userId: user.id,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return { accessToken, refreshToken: newRefreshToken };
});

app.post('/auth/logout', async (request, reply) => {
  const { refreshToken } = request.body;
  refreshTokens.delete(refreshToken);
  return { success: true };
});
```

## Role-Based Access Control

Implement RBAC with decorators:

```typescript
type Role = 'admin' | 'user' | 'moderator';

// Create authorization decorator
app.decorate('authorize', function (...allowedRoles: Role[]) {
  return async (request, reply) => {
    await request.jwtVerify();

    const userRole = request.user.role as Role;
    if (!allowedRoles.includes(userRole)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Role '${userRole}' is not authorized for this resource`,
      });
    }
  };
});

// Admin only route
app.get('/admin/users', {
  onRequest: [app.authorize('admin')],
}, async (request) => {
  return db.users.findAll();
});

// Admin or moderator
app.delete('/posts/:id', {
  onRequest: [app.authorize('admin', 'moderator')],
}, async (request) => {
  await db.posts.delete(request.params.id);
  return { deleted: true };
});
```

## Permission-Based Authorization

Fine-grained permission checks:

```typescript
interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete';
}

const rolePermissions: Record<string, Permission[]> = {
  admin: [
    { resource: '*', action: 'create' },
    { resource: '*', action: 'read' },
    { resource: '*', action: 'update' },
    { resource: '*', action: 'delete' },
  ],
  user: [
    { resource: 'posts', action: 'create' },
    { resource: 'posts', action: 'read' },
    { resource: 'comments', action: 'create' },
    { resource: 'comments', action: 'read' },
  ],
};

function hasPermission(role: string, resource: string, action: string): boolean {
  const permissions = rolePermissions[role] || [];
  return permissions.some(
    (p) =>
      (p.resource === '*' || p.resource === resource) &&
      p.action === action
  );
}

app.decorate('checkPermission', function (resource: string, action: string) {
  return async (request, reply) => {
    await request.jwtVerify();

    if (!hasPermission(request.user.role, resource, action)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Not allowed to ${action} ${resource}`,
      });
    }
  };
});

// Usage
app.post('/posts', {
  onRequest: [app.checkPermission('posts', 'create')],
}, createPostHandler);

app.delete('/posts/:id', {
  onRequest: [app.checkPermission('posts', 'delete')],
}, deletePostHandler);
```

## API Key / Bearer Token Authentication

Use `@fastify/bearer-auth` for API key and bearer token authentication:

```typescript
import bearerAuth from '@fastify/bearer-auth';

const validKeys = new Set([process.env.API_KEY]);

app.register(bearerAuth, {
  keys: validKeys,
  errorResponse: (err) => ({
    error: 'Unauthorized',
    message: 'Invalid API key',
  }),
});

// All routes are now protected
app.get('/api/data', async (request) => {
  return { data: [] };
});
```

For database-backed API keys with custom validation:

```typescript
import bearerAuth from '@fastify/bearer-auth';

app.register(bearerAuth, {
  auth: async (key, request) => {
    const apiKey = await db.apiKeys.findByKey(key);

    if (!apiKey || !apiKey.active) {
      return false;
    }

    // Track usage (fire and forget)
    db.apiKeys.recordUsage(apiKey.id, {
      ip: request.ip,
      timestamp: new Date(),
    });

    request.apiKey = apiKey;
    return true;
  },
  errorResponse: (err) => ({
    error: 'Unauthorized',
    message: 'Invalid API key',
  }),
});
```

## OAuth 2.0 Integration

Integrate with OAuth providers using @fastify/oauth2:

```typescript
import fastifyOauth2 from '@fastify/oauth2';

app.register(fastifyOauth2, {
  name: 'googleOAuth2',
  scope: ['profile', 'email'],
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID,
      secret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  startRedirectPath: '/auth/google',
  callbackUri: 'http://localhost:3000/auth/google/callback',
  discovery: {
    issuer: 'https://accounts.google.com',
  },
});

app.get('/auth/google/callback', async (request, reply) => {
  const { token } = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

  // Fetch user info from Google
  const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }).then((r) => r.json());

  // Find or create user
  let user = await db.users.findByEmail(userInfo.email);
  if (!user) {
    user = await db.users.create({
      email: userInfo.email,
      name: userInfo.name,
      provider: 'google',
      providerId: userInfo.id,
    });
  }

  // Generate JWT
  const jwt = app.jwt.sign({ id: user.id, role: user.role });

  // Redirect to frontend with token
  return reply.redirect(`/auth/success?token=${jwt}`);
});
```

## Session-Based Authentication

Use @fastify/session for session management:

```typescript
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

app.register(fastifyCookie);
app.register(fastifySession, {
  secret: process.env.SESSION_SECRET,
  store: new RedisStore({ client: redisClient }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  },
});

app.post('/login', async (request, reply) => {
  const { email, password } = request.body;
  const user = await validateCredentials(email, password);

  if (!user) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }

  request.session.userId = user.id;
  request.session.role = user.role;

  return { success: true };
});

app.decorate('requireSession', async function (request, reply) {
  if (!request.session.userId) {
    return reply.code(401).send({ error: 'Not authenticated' });
  }
});

app.get('/profile', {
  onRequest: [app.requireSession],
}, async (request) => {
  const user = await db.users.findById(request.session.userId);
  return { user };
});

app.post('/logout', async (request, reply) => {
  await request.session.destroy();
  return { success: true };
});
```

## Resource-Based Authorization

Check ownership of resources:

```typescript
app.decorate('checkOwnership', function (getResourceOwnerId: (request) => Promise<string>) {
  return async (request, reply) => {
    const ownerId = await getResourceOwnerId(request);

    if (ownerId !== request.user.id && request.user.role !== 'admin') {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You do not own this resource',
      });
    }
  };
});

// Check post ownership
app.put('/posts/:id', {
  onRequest: [
    app.authenticate,
    app.checkOwnership(async (request) => {
      const post = await db.posts.findById(request.params.id);
      return post?.authorId;
    }),
  ],
}, updatePostHandler);

// Alternative: inline check
app.put('/posts/:id', {
  onRequest: [app.authenticate],
}, async (request, reply) => {
  const post = await db.posts.findById(request.params.id);

  if (!post) {
    return reply.code(404).send({ error: 'Post not found' });
  }

  if (post.authorId !== request.user.id && request.user.role !== 'admin') {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  return db.posts.update(post.id, request.body);
});
```

## Password Hashing

Use secure password hashing with argon2:

```typescript
import { hash, verify } from '@node-rs/argon2';

async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return verify(hash, password);
}

app.post('/register', async (request, reply) => {
  const { email, password } = request.body;

  const hashedPassword = await hashPassword(password);
  const user = await db.users.create({
    email,
    password: hashedPassword,
  });

  reply.code(201);
  return { id: user.id, email: user.email };
});

app.post('/login', async (request, reply) => {
  const { email, password } = request.body;
  const user = await db.users.findByEmail(email);

  if (!user || !(await verifyPassword(user.password, password))) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }

  const token = app.jwt.sign({ id: user.id, role: user.role });
  return { token };
});
```

## Rate Limiting for Auth Endpoints

Protect auth endpoints from brute force. **IMPORTANT: For production security, you MUST configure rate limiting with a Redis backend.** In-memory rate limiting is not safe for distributed deployments and can be bypassed.

```typescript
import fastifyRateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Global rate limit with Redis backend
app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis, // REQUIRED for production - ensures rate limiting works across all instances
});

// Stricter limit for auth endpoints
app.register(async function authRoutes(fastify) {
  await fastify.register(fastifyRateLimit, {
    max: 5,
    timeWindow: '1 minute',
    redis, // REQUIRED for production
    keyGenerator: (request) => {
      // Rate limit by IP + email combination
      const email = request.body?.email || '';
      return `${request.ip}:${email}`;
    },
  });

  fastify.post('/login', loginHandler);
  fastify.post('/register', registerHandler);
  fastify.post('/forgot-password', forgotPasswordHandler);
}, { prefix: '/auth' });
```
