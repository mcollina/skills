---
name: logging
description: Logging with Pino in Fastify
metadata:
  tags: logging, pino, debugging, observability
---

# Logging with Pino

## Contents

- [Built-in Pino Integration](#built-in-pino-integration)
- [Log Levels](#log-levels)
- [Request-Scoped Logging](#request-scoped-logging)
- [Structured Logging](#structured-logging)
- [Logging Configuration by Environment](#logging-configuration-by-environment)
- [Custom Serializers](#custom-serializers)
- [Redacting Sensitive Data](#redacting-sensitive-data)
- [Child Loggers](#child-loggers)
- [Request Logging Configuration](#request-logging-configuration)
- [Logging Errors](#logging-errors)
- [Log Destinations](#log-destinations)
- [Log Rotation](#log-rotation)
- [Log Aggregation](#log-aggregation)
- [Request ID Tracking](#request-id-tracking)
- [Performance Considerations](#performance-considerations)

## Built-in Pino Integration

Fastify uses Pino for high-performance logging:

```typescript
import Fastify from 'fastify';

const app = Fastify({
  logger: true, // Enable default logging
});

// Or with configuration
const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  },
});
```

## Log Levels

Available log levels (in order of severity):

```typescript
app.log.trace('Detailed debugging');
app.log.debug('Debugging information');
app.log.info('General information');
app.log.warn('Warning messages');
app.log.error('Error messages');
app.log.fatal('Fatal errors');
```

## Request-Scoped Logging

Each request has its own logger with request context:

```typescript
app.get('/users/:id', async (request) => {
  // Logs include request ID automatically
  request.log.info('Fetching user');

  const user = await db.users.findById(request.params.id);

  if (!user) {
    request.log.warn({ userId: request.params.id }, 'User not found');
    return { error: 'Not found' };
  }

  request.log.info({ userId: user.id }, 'User fetched');
  return user;
});
```

## Structured Logging

Always use structured logging with objects:

```typescript
// GOOD - structured, searchable
request.log.info({
  action: 'user_created',
  userId: user.id,
  email: user.email,
}, 'User created successfully');

request.log.error({
  err: error,
  userId: request.params.id,
  operation: 'fetch_user',
}, 'Failed to fetch user');

// BAD - unstructured, hard to parse
request.log.info(`User ${user.id} created with email ${user.email}`);
request.log.error(`Failed to fetch user: ${error.message}`);
```

## Logging Configuration by Environment

```typescript
function getLoggerConfig() {
  if (process.env.NODE_ENV === 'production') {
    return {
      level: 'info',
      // JSON output for log aggregation
    };
  }

  if (process.env.NODE_ENV === 'test') {
    return false; // Disable logging in tests
  }

  // Development
  return {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  };
}

const app = Fastify({
  logger: getLoggerConfig(),
});
```

## Custom Serializers

Customize how objects are serialized:

```typescript
const app = Fastify({
  logger: {
    level: 'info',
    serializers: {
      // Customize request serialization
      req: (request) => ({
        method: request.method,
        url: request.url,
        headers: {
          host: request.headers.host,
          'user-agent': request.headers['user-agent'],
        },
        remoteAddress: request.ip,
      }),

      // Customize response serialization
      res: (response) => ({
        statusCode: response.statusCode,
      }),

      // Custom serializer for users
      user: (user) => ({
        id: user.id,
        email: user.email,
        // Exclude sensitive fields
      }),
    },
  },
});

// Use custom serializer
request.log.info({ user: request.user }, 'User action');
```

## Redacting Sensitive Data

Prevent logging sensitive information:

```typescript
import Fastify from 'fastify';

const app = Fastify({
  logger: {
    level: 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.password',
        'body.creditCard',
        '*.password',
        '*.secret',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  },
});
```

## Child Loggers

Create child loggers with additional context:

```typescript
app.addHook('onRequest', async (request) => {
  // Add user context to all logs for this request
  if (request.user) {
    request.log = request.log.child({
      userId: request.user.id,
      userRole: request.user.role,
    });
  }
});

// Service-level child logger
const userService = {
  log: app.log.child({ service: 'UserService' }),

  async create(data) {
    this.log.info({ email: data.email }, 'Creating user');
    // ...
  },
};
```

## Request Logging Configuration

Customize automatic request logging:

```typescript
const app = Fastify({
  logger: true,
  disableRequestLogging: true, // Disable default request/response logs
});

// Custom request logging
app.addHook('onRequest', async (request) => {
  request.log.info({
    method: request.method,
    url: request.url,
    query: request.query,
  }, 'Request received');
});

app.addHook('onResponse', async (request, reply) => {
  request.log.info({
    statusCode: reply.statusCode,
    responseTime: reply.elapsedTime,
  }, 'Request completed');
});
```

## Logging Errors

Properly log errors with stack traces:

```typescript
app.setErrorHandler((error, request, reply) => {
  // Log error with full details
  request.log.error({
    err: error, // Pino serializes error objects properly
    url: request.url,
    method: request.method,
    body: request.body,
    query: request.query,
  }, 'Request error');

  reply.code(error.statusCode || 500).send({
    error: error.message,
  });
});

// In handlers
app.get('/data', async (request) => {
  try {
    return await fetchData();
  } catch (error) {
    request.log.error({ err: error }, 'Failed to fetch data');
    throw error;
  }
});
```

## Log Destinations

Configure where logs are sent:

```typescript
import { createWriteStream } from 'node:fs';

// File output
const app = Fastify({
  logger: {
    level: 'info',
    stream: createWriteStream('./app.log'),
  },
});

// Multiple destinations with pino.multistream
import pino from 'pino';

const streams = [
  { stream: process.stdout },
  { stream: createWriteStream('./app.log') },
  { level: 'error', stream: createWriteStream('./error.log') },
];

const app = Fastify({
  logger: pino({ level: 'info' }, pino.multistream(streams)),
});
```

## Log Rotation

Use pino-roll for log rotation:

```bash
node app.js | pino-roll --frequency daily --extension .log
```

Or configure programmatically:

```typescript
import { createStream } from 'rotating-file-stream';

const stream = createStream('app.log', {
  size: '10M',     // Rotate every 10MB
  interval: '1d',  // Rotate daily
  compress: 'gzip',
  path: './logs',
});

const app = Fastify({
  logger: {
    level: 'info',
    stream,
  },
});
```

## Log Aggregation

Format logs for aggregation services:

```typescript
// For ELK Stack, Datadog, etc. - use default JSON format
const app = Fastify({
  logger: {
    level: 'info',
    // Default JSON output works with most log aggregators
  },
});

// Add service metadata
const app = Fastify({
  logger: {
    level: 'info',
    base: {
      service: 'user-api',
      version: process.env.APP_VERSION,
      environment: process.env.NODE_ENV,
    },
  },
});
```

## Request ID Tracking

Use request IDs for distributed tracing:

```typescript
const app = Fastify({
  logger: true,
  requestIdHeader: 'x-request-id', // Use incoming header
  genReqId: (request) => {
    // Generate ID if not provided
    return request.headers['x-request-id'] || crypto.randomUUID();
  },
});

// Forward request ID to downstream services
app.addHook('onRequest', async (request) => {
  request.requestId = request.id;
});

// Include in outgoing requests
const response = await fetch('http://other-service/api', {
  headers: {
    'x-request-id': request.id,
  },
});
```

## Performance Considerations

Pino is fast, but consider:

```typescript
// Avoid string concatenation in log calls
// BAD
request.log.info('User ' + user.id + ' did ' + action);

// GOOD
request.log.info({ userId: user.id, action }, 'User action');

// Use appropriate log levels
// Don't log at info level in hot paths
if (app.log.isLevelEnabled('debug')) {
  request.log.debug({ details: expensiveToCompute() }, 'Debug info');
}
```
