---
name: streams
description: Working with Node.js streams
metadata:
  tags: streams, readable, writable, transform, pipeline
---

# Node.js Streams

## Use pipeline for Stream Composition

Always use `pipeline` instead of `.pipe()` for proper error handling:

```typescript
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';

async function compressFile(input: string, output: string): Promise<void> {
  await pipeline(
    createReadStream(input),
    createGzip(),
    createWriteStream(output)
  );
}
```

### Async Generators in Pipeline

Use async generators for transformation:

```typescript
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';

async function* toUpperCase(source: AsyncIterable<Buffer>): AsyncGenerator<string> {
  for await (const chunk of source) {
    yield chunk.toString().toUpperCase();
  }
}

async function processFile(input: string, output: string): Promise<void> {
  await pipeline(
    createReadStream(input),
    toUpperCase,
    createWriteStream(output)
  );
}
```

### Multiple Transformations

Chain multiple async generators:

```typescript
import { pipeline } from 'node:stream/promises';

async function* parseLines(source: AsyncIterable<Buffer>): AsyncGenerator<string> {
  let buffer = '';
  for await (const chunk of source) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      yield line;
    }
  }
  if (buffer) yield buffer;
}

async function* filterNonEmpty(source: AsyncIterable<string>): AsyncGenerator<string> {
  for await (const line of source) {
    if (line.trim()) {
      yield line + '\n';
    }
  }
}

await pipeline(
  createReadStream('input.txt'),
  parseLines,
  filterNonEmpty,
  createWriteStream('output.txt')
);
```

## Async Iterators with Streams

Use async iterators for consuming streams:

```typescript
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

async function processLines(filePath: string): Promise<void> {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    await processLine(line);
  }
}
```

## Readable.from for Creating Streams

Create readable streams from iterables:

```typescript
import { Readable } from 'node:stream';

async function* generateData(): AsyncGenerator<string> {
  for (let i = 0; i < 100; i++) {
    yield JSON.stringify({ id: i, timestamp: Date.now() }) + '\n';
  }
}

const stream = Readable.from(generateData());
```

## Backpressure Handling

Respect backpressure signals using `once` from events:

```typescript
import { Writable } from 'node:stream';
import { once } from 'node:events';

async function writeData(
  writable: Writable,
  data: string[]
): Promise<void> {
  for (const chunk of data) {
    const canContinue = writable.write(chunk);
    if (!canContinue) {
      await once(writable, 'drain');
    }
  }
}
```

## Stream Consumers (Node.js 18+)

Use stream consumers for common operations:

```typescript
import { text, json, buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';

async function readStreamAsJson<T>(stream: Readable): Promise<T> {
  return json(stream) as Promise<T>;
}

async function readStreamAsText(stream: Readable): Promise<string> {
  return text(stream);
}
```
