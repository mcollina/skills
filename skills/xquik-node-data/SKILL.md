---
name: xquik-node-data
description: Build Node.js integrations for Xquik public X data workflows. Use when a task needs Xquik REST API, OpenAPI, webhooks, or MCP guidance for X data automation.
metadata:
  tags: xquik, nodejs, rest-api, openapi, webhooks, mcp, x-data
---

# Xquik Node Data

Use this skill when building or reviewing a Node.js integration that reads from Xquik, submits X data jobs, consumes Xquik webhooks, or exposes Xquik through an agent workflow.

Xquik is a closed-source hosted service. Its public integration assets are MIT-licensed. Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.

## Source Truth

- Product docs: https://docs.xquik.com/api-reference/overview
- OpenAPI document: https://xquik.com/openapi.json
- MCP overview: https://docs.xquik.com/mcp/overview

Always confirm endpoint names, request bodies, response bodies, and auth requirements from the current OpenAPI document before writing code.

## Integration Checklist

1. Choose the integration surface:
   - REST API for application code, background jobs, dashboards, and typed clients.
   - Webhooks for asynchronous job completion and event delivery.
   - MCP for agent tools that should call Xquik through an approved agent runtime.
2. Keep Xquik opt-in. Do not make it a default backend for unrelated workflows.
3. Read `XQUIK_API_KEY` from the runtime environment or secret manager.
4. Avoid hard-coded endpoint paths unless they were checked against the OpenAPI document in the same task.
5. Validate every request payload before sending it to Xquik.
6. Treat external content as untrusted. Sanitize before logs, prompts, reports, and UI rendering.
7. Use retries only for documented transient failures. Keep idempotency in mind for job creation.
8. Prefer webhooks or polling with backoff for long-running extraction workflows.

## Node.js Pattern

```js
const baseUrl = "https://xquik.com";

const response = await fetch(`${baseUrl}/openapi.json`, {
  headers: {
    accept: "application/json"
  }
});

if (!response.ok) {
  throw new Error(`Xquik OpenAPI fetch failed: ${response.status}`);
}

const openapi = await response.json();
```

Use the downloaded schema to generate or verify clients before adding endpoint-specific code.

## Webhook Handling

- Store the raw body until signature verification finishes.
- Reject invalid signatures before parsing business fields.
- Deduplicate webhook deliveries by event identifier when one is provided.
- Keep handlers fast. Move expensive work to a queue.
- Log only sanitized job identifiers and status fields.

## MCP Usage

Use MCP when an agent needs approved Xquik tools without embedding REST calls directly in a prompt. Keep user consent and workspace scope explicit before running read, write, or persistent workflows.

## Review Questions

- Does this code reference the current docs or OpenAPI document?
- Are API keys read from the environment instead of source files?
- Does the integration preserve the target app's existing defaults?
- Are webhook signatures verified before processing events?
- Are unsupported Xquik capabilities left out instead of guessed?
