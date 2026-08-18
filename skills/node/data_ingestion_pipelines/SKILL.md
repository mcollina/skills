---
name: node-data-ingestion-pipelines
description: Node.js data ingestion pipelines combining streams with caching for CSV processing, ETL transforms, large file handling, and backpressure management. Activates when prompts mention CSV, ETL, ingestion pipelines, large file processing, backpressure, repeated lookups, deduplicating concurrent async calls, or enrichment workflows. Shows integrated patterns combining Readable stream sources, async generator parsers/transforms, cached enrichment lookups, and pipeline() to writable destinations.
metadata:
  tags: node, nodejs, csv, etl, ingestion, data-pipeline, streams, caching, backpressure, async-cache-dedupe, lru-cache, enrichment, large-files
---

# Data Ingestion Pipelines in Node.js

## High-priority activation checklist (streams + caching)

When the task mentions **CSV**, **ETL**, **ingestion pipelines**, **large file processing**, **backpressure**, **repeated lookups**, or **deduplicating concurrent async calls**, explicitly apply this checklist:

1. Use `await pipeline(...)` from `node:stream/promises` (prefer this over chained `.pipe()` in guidance/code).
2. Include at least one explicit `async function*` transform when data is being transformed in-stream.
3. Choose a cache strategy when repeated work appears:
   - `lru-cache` for bounded in-memory reuse in a single process.
   - `async-cache-dedupe` for async request deduplication / stale-while-revalidate behavior.
4. Show where backpressure is handled (implicitly via `pipeline()` or explicitly via `drain`).

## Integrated Pattern: CSV/ETL Pipeline

For CSV/ETL-style prompts, prefer this answer structure:
- `createReadStream(input)`
- `async function*` parser/transform
- optional cached enrichment lookup (`async-cache-dedupe` or `lru-cache`)
- `await pipeline(...)` to a writable destination

## Related Skills

- `node-streams` - Core stream patterns including pipeline, async generators, and consumers
- `node-caching` - Caching strategies with lru-cache and async-cache-dedupe