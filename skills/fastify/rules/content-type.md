---
name: content-type
description: Content type parsing in Fastify
metadata:
  tags: content-type, parsing, body, multipart, json
---

# Content Type Parsing

## Contents

- [Default Content Type Parsers](#default-content-type-parsers)
- [Custom Content Type Parsers](#custom-content-type-parsers)
- [XML Parsing](#xml-parsing)
- [Multipart Form Data](#multipart-form-data)
- [Stream Processing](#stream-processing)
- [Custom JSON Parser](#custom-json-parser)
- [Content Type with Parameters](#content-type-with-parameters)
- [Catch-All Parser](#catch-all-parser)
- [Body Limit Configuration](#body-limit-configuration)
- [Protocol Buffers](#protocol-buffers)
- [Form Data with @fastify/formbody](#form-data-with-fastifyformbody)
- [Content Negotiation](#content-negotiation)
- [Validation After Parsing](#validation-after-parsing)

## Default Content Type Parsers

Fastify includes parsers for common content types:

```typescript
import Fastify from 'fastify';

const app = Fastify();

// Built-in parsers:
// - application/json
// - text/plain

app.post('/json', async (request) => {
  // request.body is parsed JSON object
  return { received: request.body };
});

app.post('/text', async (request) => {
  // request.body is string for text/plain
  return { text: request.body };
});
```

## Custom Content Type Parsers

Add parsers for additional content types:

```typescript
// Parse application/x-www-form-urlencoded
app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (request, body, done) => {
    const parsed = new URLSearchParams(body);
    done(null, Object.fromEntries(parsed));
  },
);

// Async parser
app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  async (request, body) => {
    const parsed = new URLSearchParams(body);
    return Object.fromEntries(parsed);
  },
);
```

## XML Parsing

Parse XML content:

```typescript
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

app.addContentTypeParser(
  'application/xml',
  { parseAs: 'string' },
  async (request, body) => {
    return xmlParser.parse(body);
  },
);

app.addContentTypeParser(
  'text/xml',
  { parseAs: 'string' },
  async (request, body) => {
    return xmlParser.parse(body);
  },
);

app.post('/xml', async (request) => {
  // request.body is parsed XML as JavaScript object
  return { data: request.body };
});
```

## Multipart Form Data

Use @fastify/multipart for file uploads. **Configure these critical options:**

```typescript
import fastifyMultipart from '@fastify/multipart';

app.register(fastifyMultipart, {
  // CRITICAL: Always set explicit limits
  limits: {
    fieldNameSize: 100,      // Max field name size in bytes
    fieldSize: 1024 * 1024,  // Max field value size (1MB)
    fields: 10,              // Max number of non-file fields
    fileSize: 10 * 1024 * 1024, // Max file size (10MB)
    files: 5,                // Max number of files
    headerPairs: 2000,       // Max number of header pairs
    parts: 1000,             // Max number of parts (fields + files)
  },
  // IMPORTANT: Throw on limit exceeded (default is to truncate silently!)
  throwFileSizeLimit: true,
  // Attach all fields to request.body for easier access
  attachFieldsToBody: true,
  // Only accept specific file types (security!)
  // onFile: async (part) => {
  //   if (!['image/jpeg', 'image/png'].includes(part.mimetype)) {
  //     throw new Error('Invalid file type');
  //   }
  // },
});

// Handle file upload
app.post('/upload', async (request, reply) => {
  const data = await request.file();

  if (!data) {
    return reply.code(400).send({ error: 'No file uploaded' });
  }

  // data.file is a stream
  const buffer = await data.toBuffer();

  return {
    filename: data.filename,
    mimetype: data.mimetype,
    size: buffer.length,
  };
});

// Handle multiple files
app.post('/upload-multiple', async (request) => {
  const files = [];

  for await (const part of request.files()) {
    const buffer = await part.toBuffer();
    files.push({
      filename: part.filename,
      mimetype: part.mimetype,
      size: buffer.length,
    });
  }

  return { files };
});

// Handle mixed form data
app.post('/form', async (request) => {
  const parts = request.parts();
  const fields: Record<string, string> = {};
  const files: Array<{ name: string; size: number }> = [];

  for await (const part of parts) {
    if (part.type === 'file') {
      const buffer = await part.toBuffer();
      files.push({ name: part.filename, size: buffer.length });
    } else {
      fields[part.fieldname] = part.value as string;
    }
  }

  return { fields, files };
});
```

## Stream Processing

Process body as stream for large payloads:

```typescript
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

// Add parser that returns stream
app.addContentTypeParser(
  'application/octet-stream',
  async (request, payload) => {
    return payload; // Return stream directly
  },
);

app.post('/upload-stream', async (request, reply) => {
  const destination = createWriteStream('./upload.bin');

  await pipeline(request.body, destination);

  return { success: true };
});
```

## Custom JSON Parser

Replace the default JSON parser:

```typescript
// Remove default parser
app.removeContentTypeParser('application/json');

// Add custom parser with error handling
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  async (request, body) => {
    try {
      return JSON.parse(body);
    } catch (error) {
      throw {
        statusCode: 400,
        code: 'INVALID_JSON',
        message: 'Invalid JSON payload',
      };
    }
  },
);
```

## Content Type with Parameters

Handle content types with parameters:

```typescript
// Match content type with any charset
app.addContentTypeParser(
  'application/json; charset=utf-8',
  { parseAs: 'string' },
  async (request, body) => {
    return JSON.parse(body);
  },
);

// Use regex for flexible matching
app.addContentTypeParser(
  /^application\/.*\+json$/,
  { parseAs: 'string' },
  async (request, body) => {
    return JSON.parse(body);
  },
);
```

## Catch-All Parser

Handle unknown content types:

```typescript
app.addContentTypeParser('*', async (request, payload) => {
  const chunks: Buffer[] = [];

  for await (const chunk of payload) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);

  // Try to determine content type
  const contentType = request.headers['content-type'];

  if (contentType?.includes('json')) {
    return JSON.parse(buffer.toString('utf-8'));
  }

  if (contentType?.includes('text')) {
    return buffer.toString('utf-8');
  }

  return buffer;
});
```

## Body Limit Configuration

Configure body size limits:

```typescript
// Global limit
const app = Fastify({
  bodyLimit: 1048576, // 1MB
});

// Per-route limit
app.post('/large-upload', {
  bodyLimit: 52428800, // 50MB for this route
}, async (request) => {
  return { size: JSON.stringify(request.body).length };
});

// Per content type limit
app.addContentTypeParser('application/json', {
  parseAs: 'string',
  bodyLimit: 2097152, // 2MB for JSON
}, async (request, body) => {
  return JSON.parse(body);
});
```

## Protocol Buffers

Parse protobuf content:

```typescript
import protobuf from 'protobufjs';

const root = await protobuf.load('./schema.proto');
const MessageType = root.lookupType('package.MessageType');

app.addContentTypeParser(
  'application/x-protobuf',
  { parseAs: 'buffer' },
  async (request, body) => {
    const message = MessageType.decode(body);
    return MessageType.toObject(message);
  },
);
```

## Form Data with @fastify/formbody

Simple form parsing:

```typescript
import formbody from '@fastify/formbody';

app.register(formbody);

app.post('/form', async (request) => {
  // request.body is parsed form data
  const { name, email } = request.body as { name: string; email: string };
  return { name, email };
});
```

## Content Negotiation

Handle different request formats:

```typescript
app.post('/data', async (request, reply) => {
  const contentType = request.headers['content-type'];

  // Body is already parsed by the appropriate parser
  const data = request.body;

  // Respond based on Accept header
  const accept = request.headers.accept;

  if (accept?.includes('application/xml')) {
    reply.type('application/xml');
    return `<data>${JSON.stringify(data)}</data>`;
  }

  reply.type('application/json');
  return data;
});
```

## Validation After Parsing

Validate parsed content:

```typescript
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        email: { type: 'string', format: 'email' },
      },
      required: ['name', 'email'],
    },
  },
}, async (request) => {
  // Body is parsed AND validated
  return request.body;
});
```
