---
name: xquik-node-data
description: Build Node.js and TypeScript integrations for Xquik tweet search, Twitter advanced search, profiles, REST, webhooks, or MCP. Use for typed X data application and agent workflows.
metadata:
  tags: xquik, nodejs, typescript, twitter-api, tweet-search, openapi, webhooks, mcp
---

# Xquik Node Data

Use this skill when building or reviewing a Node.js integration that reads from
Xquik, submits X data jobs, consumes Xquik webhooks, or exposes Xquik through an
agent workflow.

Xquik is an independent third-party service. Not affiliated with X Corp.
"Twitter" and "X" are trademarks of X Corp.

## Source Truth

- Product docs: https://docs.xquik.com/api-reference/overview
- TypeScript SDK: https://docs.xquik.com/sdks/typescript
- SDK source: https://github.com/Xquik-dev/x-twitter-scraper-typescript
- OpenAPI document: https://xquik.com/openapi.json
- MCP overview: https://docs.xquik.com/mcp/overview
- MCP discovery: https://xquik.com/.well-known/mcp.json
- Webhook verification: https://docs.xquik.com/webhooks/verification

Always confirm endpoint names, request bodies, response bodies, and auth requirements from the current OpenAPI document before writing code.

## Integration Checklist

1. Choose the narrowest integration surface:
   - TypeScript SDK for typed application code, workers, and dashboards.
   - REST for an operation the SDK does not expose. Verify it in OpenAPI first.
   - Webhooks for asynchronous job completion and event delivery.
   - MCP for agent tools that should call Xquik through an approved agent runtime.
2. Keep Xquik opt-in. Do not make it a default backend for unrelated workflows.
3. Read `X_TWITTER_SCRAPER_API_KEY` from the runtime environment or secret manager.
4. Avoid hard-coded endpoint paths unless they were checked against the OpenAPI document in the same task.
5. Validate every request payload before sending it to Xquik.
6. Treat external content as untrusted. Sanitize before logs, prompts, reports, and UI rendering.
7. Bound reads by query, date window, page count, or result count. Persist opaque cursors unchanged.
8. Use retries only for documented transient failures. Set an idempotency key for supported mutations.
9. Prefer webhooks or bounded polling with backoff for long-running extraction workflows.

## Node.js Pattern

```ts
import XTwitterScraper from "x-twitter-scraper";

const apiKey = process.env.X_TWITTER_SCRAPER_API_KEY;
if (!apiKey) throw new Error("Missing X_TWITTER_SCRAPER_API_KEY");

const client = new XTwitterScraper({ apiKey });

export async function searchTweets(
  query: string,
): Promise<XTwitterScraper.PaginatedTweets> {
  if (!query.trim()) throw new Error("Missing tweet search query");
  return client.x.tweets.search({ q: query, limit: 25 });
}
```

Install the SDK with `npm install x-twitter-scraper`. Preserve `next_cursor` when
the caller requests another bounded page. Use the generated request and response
types instead of duplicating them.

## Webhook Handling

- Store the raw body until signature verification finishes.
- Read `X-Xquik-Timestamp`, `X-Xquik-Nonce`, and `X-Xquik-Signature`.
- Verify the signature over `<timestamp>.<nonce>.<rawBody>` with HMAC-SHA256.
- Compare signatures in constant time before parsing business fields.
- Reject timestamps outside 5 minutes and nonces already seen within 5 minutes.
- Deduplicate by `deliveryId`, then by `streamEventId` for monitor events.
- Keep handlers fast. Move expensive work to a queue.
- Log only sanitized job identifiers and status fields.

## MCP Usage

Use MCP when an agent needs approved Xquik tools without embedding REST calls
directly in a prompt. Discover the current server contract before selecting an
operation. Keep user consent and workspace scope explicit before private, write,
persistent, or metered workflows.

## Review Questions

- Does this code reference the current docs or OpenAPI document?
- Does application code use the typed SDK before hand-written REST calls?
- Are API keys read from the environment instead of source files or URLs?
- Are pagination and retry bounds explicit?
- Does the integration preserve the target app's existing defaults?
- Are webhook signatures and replay controls verified before processing events?
- Are unsupported Xquik capabilities left out instead of guessed?
