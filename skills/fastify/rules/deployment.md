---
name: deployment
description: Production deployment for Fastify applications
metadata:
  tags: deployment, production, docker, kubernetes, scaling
---

# Production Deployment

## Contents

- [Graceful Shutdown with close-with-grace](#graceful-shutdown-with-close-with-grace)
- [Health Check Endpoints](#health-check-endpoints)
- [Docker Configuration](#docker-configuration)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Production Logger Configuration](#production-logger-configuration)
- [Request Timeouts](#request-timeouts)
- [Trust Proxy Settings](#trust-proxy-settings)
- [Static File Serving](#static-file-serving)
- [Compression](#compression)
- [Metrics and Monitoring](#metrics-and-monitoring)
- [Zero-Downtime Deployments](#zero-downtime-deployments)

## Graceful Shutdown with close-with-grace

Use `close-with-grace` for proper shutdown handling:

```typescript
import Fastify from 'fastify';
import closeWithGrace from 'close-with-grace';

const app = Fastify({ logger: true });

// Register plugins and routes
await app.register(import('./plugins/index.js'));
await app.register(import('./routes/index.js'));

// Graceful shutdown handler
closeWithGrace({ delay: 10000 }, async ({ signal, err }) => {
  if (err) {
    app.log.error({ err }, 'Server closing due to error');
  } else {
    app.log.info({ signal }, 'Server closing due to signal');
  }

  await app.close();
});

// Start server
await app.listen({
  port: parseInt(process.env.PORT || '3000', 10),
  host: '0.0.0.0',
});

app.log.info(`Server listening on ${app.server.address()}`);
```

## Health Check Endpoints

Implement comprehensive health checks:

```typescript
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

app.get('/health/live', async () => {
  return { status: 'ok' };
});

app.get('/health/ready', async (request, reply) => {
  const checks = {
    database: false,
    cache: false,
  };

  try {
    await app.db`SELECT 1`;
    checks.database = true;
  } catch {
    // Database not ready
  }

  try {
    await app.cache.ping();
    checks.cache = true;
  } catch {
    // Cache not ready
  }

  const allHealthy = Object.values(checks).every(Boolean);

  if (!allHealthy) {
    reply.code(503);
  }

  return {
    status: allHealthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  };
});

// Detailed health for monitoring
app.get('/health/details', {
  preHandler: [app.authenticate, app.requireAdmin],
}, async () => {
  const memory = process.memoryUsage();

  return {
    status: 'ok',
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      rss: Math.round(memory.rss / 1024 / 1024),
    },
    version: process.env.APP_VERSION,
    nodeVersion: process.version,
  };
});
```

## Docker Configuration

Create an optimized Dockerfile:

```dockerfile
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Production stage
FROM node:22-alpine

WORKDIR /app

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/app.ts"]
```

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@db:5432/app
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d app"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

## Kubernetes Deployment

Deploy to Kubernetes:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fastify-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fastify-api
  template:
    metadata:
      labels:
        app: fastify-api
    spec:
      containers:
        - name: api
          image: my-registry/fastify-api:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: database-url
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]
---
apiVersion: v1
kind: Service
metadata:
  name: fastify-api
spec:
  selector:
    app: fastify-api
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

## Production Logger Configuration

Configure logging for production:

```typescript
import Fastify from 'fastify';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // JSON output for log aggregation
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: 'fastify-api',
        version: process.env.APP_VERSION,
      }),
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    // Redact sensitive data
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
  },
});
```

## Request Timeouts

Configure appropriate timeouts:

```typescript
const app = Fastify({
  connectionTimeout: 30000,     // 30s connection timeout
  keepAliveTimeout: 72000,      // 72s keep-alive (longer than ALB 60s)
  requestTimeout: 30000,        // 30s request timeout
  bodyLimit: 1048576,           // 1MB body limit
});

// Per-route timeout
app.get('/long-operation', {
  config: {
    timeout: 60000, // 60s for this route
  },
}, longOperationHandler);
```

## Trust Proxy Settings

Configure for load balancers:

```typescript
const app = Fastify({
  // Trust first proxy (load balancer)
  trustProxy: true,

  // Or trust specific proxies
  trustProxy: ['127.0.0.1', '10.0.0.0/8'],

  // Or number of proxies to trust
  trustProxy: 1,
});

// Now request.ip returns real client IP
```

## Static File Serving

Serve static files efficiently. **Always use `import.meta.dirname` as the base path**, never `process.cwd()`:

```typescript
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';

app.register(fastifyStatic, {
  root: join(import.meta.dirname, '..', 'public'),
  prefix: '/static/',
  maxAge: '1d',
  immutable: true,
  etag: true,
  lastModified: true,
});
```

## Compression

Enable response compression:

```typescript
import fastifyCompress from '@fastify/compress';

app.register(fastifyCompress, {
  global: true,
  threshold: 1024, // Only compress > 1KB
  encodings: ['gzip', 'deflate'],
});
```

## Metrics and Monitoring

Expose Prometheus metrics:

```typescript
import { register, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

collectDefaultMetrics();

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

app.addHook('onResponse', (request, reply, done) => {
  const route = request.routeOptions.url || request.url;
  const labels = {
    method: request.method,
    route,
    status: reply.statusCode,
  };

  httpRequestDuration.observe(labels, reply.elapsedTime / 1000);
  httpRequestTotal.inc(labels);
  done();
});

app.get('/metrics', async (request, reply) => {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
});
```

## Zero-Downtime Deployments

Support rolling updates:

```typescript
import closeWithGrace from 'close-with-grace';

// Stop accepting new connections gracefully
closeWithGrace({ delay: 30000 }, async ({ signal }) => {
  app.log.info({ signal }, 'Received shutdown signal');

  // Stop accepting new connections
  // Existing connections continue to be served

  // Wait for in-flight requests (handled by close-with-grace delay)
  await app.close();

  app.log.info('Server closed');
});
```

