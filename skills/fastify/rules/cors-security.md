---
name: cors-security
description: CORS and security headers in Fastify
metadata:
  tags: cors, security, headers, helmet, csrf
---

# CORS and Security

## Contents

- [CORS with @fastify/cors](#cors-with-fastifycors)
- [Dynamic CORS Origin](#dynamic-cors-origin)
- [Per-Route CORS](#per-route-cors)
- [Security Headers with @fastify/helmet](#security-headers-with-fastifyhelmet)
- [Configure Individual Headers](#configure-individual-headers)
- [Rate Limiting](#rate-limiting)
- [Redis-Based Rate Limiting](#redis-based-rate-limiting)
- [CSRF Protection](#csrf-protection)
- [Custom Security Headers](#custom-security-headers)
- [Secure Cookies](#secure-cookies)
- [Request Validation Security](#request-validation-security)
- [IP Filtering](#ip-filtering)
- [Trust Proxy](#trust-proxy)
- [HTTPS Redirect](#https-redirect)
- [Security Best Practices Summary](#security-best-practices-summary)

## CORS with @fastify/cors

Enable Cross-Origin Resource Sharing:

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify();

// Simple CORS - allow all origins
app.register(cors);

// Configured CORS
app.register(cors, {
  origin: ['https://example.com', 'https://app.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count'],
  credentials: true,
  maxAge: 86400, // 24 hours
});
```

## Dynamic CORS Origin

Validate origins dynamically:

```typescript
app.register(cors, {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check against allowed origins
    const allowedOrigins = [
      'https://example.com',
      'https://app.example.com',
      /\.example\.com$/,
    ];

    const isAllowed = allowedOrigins.some((allowed) => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
});
```

## Per-Route CORS

Configure CORS for specific routes:

```typescript
app.register(cors, {
  origin: true, // Reflect request origin
  credentials: true,
});

// Or disable CORS for specific routes
app.route({
  method: 'GET',
  url: '/internal',
  config: {
    cors: false,
  },
  handler: async () => {
    return { internal: true };
  },
});
```

## Security Headers with @fastify/helmet

Add security headers:

```typescript
import helmet from '@fastify/helmet';

app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.example.com'],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable if embedding external resources
});
```

## Configure Individual Headers

Fine-tune security headers:

```typescript
app.register(helmet, {
  // Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // Content Security Policy
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://trusted-cdn.com'],
    },
  },

  // X-Frame-Options
  frameguard: {
    action: 'deny', // or 'sameorigin'
  },

  // X-Content-Type-Options
  noSniff: true,

  // X-XSS-Protection (legacy)
  xssFilter: true,

  // Referrer-Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: false,

  // X-DNS-Prefetch-Control
  dnsPrefetchControl: {
    allow: false,
  },
});
```

## Rate Limiting

Protect against abuse:

```typescript
import rateLimit from '@fastify/rate-limit';

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: (request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Retry in ${context.after}`,
    retryAfter: context.after,
  }),
});

// Per-route rate limit
app.get('/expensive', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute',
    },
  },
}, handler);

// Skip rate limit for certain routes
app.get('/health', {
  config: {
    rateLimit: false,
  },
}, () => ({ status: 'ok' }));
```

## Redis-Based Rate Limiting

Use Redis for distributed rate limiting:

```typescript
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis,
  nameSpace: 'rate-limit:',
  keyGenerator: (request) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    return request.user?.id || request.ip;
  },
});
```

## CSRF Protection

Protect against Cross-Site Request Forgery:

```typescript
import fastifyCsrf from '@fastify/csrf-protection';
import fastifyCookie from '@fastify/cookie';

app.register(fastifyCookie);
app.register(fastifyCsrf, {
  cookieOpts: {
    signed: true,
    httpOnly: true,
    sameSite: 'strict',
  },
});

// Generate token
app.get('/csrf-token', async (request, reply) => {
  const token = reply.generateCsrf();
  return { token };
});

// Protected route
app.post('/transfer', {
  preHandler: app.csrfProtection,
}, async (request) => {
  // CSRF token validated
  return { success: true };
});
```

## Custom Security Headers

Add custom headers:

```typescript
app.addHook('onSend', async (request, reply) => {
  // Custom security headers
  reply.header('X-Request-ID', request.id);
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Permissions-Policy', 'geolocation=(), camera=()');
});

// Per-route headers
app.get('/download', async (request, reply) => {
  reply.header('Content-Disposition', 'attachment; filename="file.pdf"');
  reply.header('X-Download-Options', 'noopen');
  return reply.send(fileStream);
});
```

## Secure Cookies

Configure secure cookies:

```typescript
import cookie from '@fastify/cookie';

app.register(cookie, {
  secret: process.env.COOKIE_SECRET,
  parseOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 3600, // 1 hour
  },
});

// Set secure cookie
app.post('/login', async (request, reply) => {
  const token = await createSession(request.body);

  reply.setCookie('session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 86400,
    signed: true,
  });

  return { success: true };
});

// Read signed cookie
app.get('/profile', async (request) => {
  const session = request.cookies.session;
  const unsigned = request.unsignCookie(session);

  if (!unsigned.valid) {
    throw { statusCode: 401, message: 'Invalid session' };
  }

  return { sessionId: unsigned.value };
});
```

## Request Validation Security

Validate and sanitize input:

```typescript
// Schema-based validation protects against injection
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          maxLength: 254,
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          pattern: '^[a-zA-Z\\s]+$', // Only letters and spaces
        },
      },
      required: ['email', 'name'],
      additionalProperties: false,
    },
  },
}, handler);
```

## IP Filtering

Restrict access by IP:

```typescript
const allowedIps = new Set([
  '192.168.1.0/24',
  '10.0.0.0/8',
]);

app.addHook('onRequest', async (request, reply) => {
  if (request.url.startsWith('/admin')) {
    const clientIp = request.ip;

    if (!isIpAllowed(clientIp, allowedIps)) {
      reply.code(403).send({ error: 'Forbidden' });
    }
  }
});

function isIpAllowed(ip: string, allowed: Set<string>): boolean {
  // Implement IP/CIDR matching
  for (const range of allowed) {
    if (ipInRange(ip, range)) return true;
  }
  return false;
}
```

## Trust Proxy

Configure for reverse proxy environments:

```typescript
const app = Fastify({
  trustProxy: true, // Trust X-Forwarded-* headers
});

// Or specific proxy configuration
const app = Fastify({
  trustProxy: ['127.0.0.1', '10.0.0.0/8'],
});

// Now request.ip returns the real client IP
app.get('/ip', async (request) => {
  return {
    ip: request.ip,
    ips: request.ips, // Array of all IPs in chain
  };
});
```

## HTTPS Redirect

Force HTTPS in production:

```typescript
app.addHook('onRequest', async (request, reply) => {
  if (
    process.env.NODE_ENV === 'production' &&
    request.headers['x-forwarded-proto'] !== 'https'
  ) {
    const httpsUrl = `https://${request.hostname}${request.url}`;
    reply.redirect(301, httpsUrl);
  }
});
```

## Security Best Practices Summary

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

const app = Fastify({
  trustProxy: true,
  bodyLimit: 1048576, // 1MB max body
});

// Security plugins
app.register(helmet);
app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
});
app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Validate all input with schemas
// Never expose internal errors in production
// Use parameterized queries for database
// Keep dependencies updated
```
