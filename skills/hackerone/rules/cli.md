---
name: hackerone-cli
description: Install, authenticate, and use the hackerone CLI to fetch reports, post comments, and change report state
metadata:
  tags: hackerone, cli, api, reports, activities
---

# hackerone CLI

The `hackerone` CLI is published as [`@matteo.collina/hackerone`](https://github.com/mcollina/hackerone-nodejs) and wraps the HackerOne Customer API v1.

## Setup

- Credentials: `HACKERONE_API_IDENTIFIER` and `HACKERONE_API_TOKEN`. The repo usually keeps them in `.env`; load them with `node --env-file=<repo>/.env` instead of exporting or printing them.
- `HACKERONE_BASE_URL` overrides the API base URL (default `https://api.hackerone.com/v1`); the CLI tests use it to point at a local mock server.
- Install with `npm install -g @matteo.collina/hackerone`, or use a checkout of `hackerone-nodejs` (`npm install && npm run build`, or run `src/cli/index.ts` directly with Node 22+ type stripping).
- Invocation, loading credentials without exposing them:

```bash
node --env-file=<path>/.env "$(command -v hackerone)" <command> [options]
# or from a checkout
H1=../hackerone-nodejs
node --env-file=$H1/.env $H1/dist/cli/index.js <command> [options]
```

The examples below use `hackerone` as shorthand for either form.

## Commands

| Command | Use |
|---|---|
| `download <id> --program <handle> --output-dir <dir>` | Best first step. Writes `<dir>/<id>/report.json`, `activities.json`, and any attachments |
| `reports show <id> --with-comments --program <handle> [--json]` | Quick look at report and comments in the terminal |
| `reports list --program <handle> [--state new] [--limit 100] [--json]` | Duplicate search, queue review. `--program` is required |
| `programs list` / `programs show <id> --scopes` | Find program handles and in-scope assets |
| `reports state <id> <state> --message-file <f>` | Change state. **The message is visible to the reporter** |
| `reports comment <id> --internal --message-file <f>` | Team-only note. Drop `--internal` only for a reply the reporter should see. `--attachment-id <id>` (repeatable) attaches uploaded files |

Without `--program`, `download` skips activities and you will miss reporter follow-ups and team comments. The Node.js program handle is `nodejs`.

Write commands take `--message <text>` or `--message-file <path>` (`-` reads stdin). `reports state` and `--message-file` need a release that includes mcollina/hackerone-nodejs#2; on older versions, pass the message with `--message`. Use a file for anything longer than a sentence. After posting, verify with `reports show <id> --with-comments --program <h> --json` that `internal` came back as intended.

Valid states: `new`, `triaged`, `needs-more-info`, `resolved`, `not-applicable`, `informative`, `duplicate`, `spam`.

## Reading report.json

`download` saves the JSON:API resource itself, without the top-level `data` wrapper. Useful fields:

- `attributes`: `title`, `state`, `created_at`, `vulnerability_information` (the Markdown body)
- `relationships.severity.data.attributes`: reporter-chosen `rating`, CVSS fields if given
- `relationships.weakness.data.attributes`: CWE, when set
- `relationships.structured_scope.data.attributes.asset_identifier`: affected asset
- `relationships.attachments.data[].attributes.file_name`: attachments; a reporter mentioning a patch that is not listed here means it was not uploaded

`activities.json` is a plain array of activities with `type` (e.g. `activity-comment`, `activity-bug-triaged`), `attributes.message`, and `attributes.internal` (true for team-only notes).

```bash
node -e 'const r=require(process.argv[1]);console.log(r.attributes.title);console.log(r.attributes.vulnerability_information)' "$DIR/report.json"
```

## Duplicate search

```bash
hackerone reports list --program nodejs --limit 100 --json \
  | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{for(const r of JSON.parse(s).data)if(/KEYWORD/i.test(r.attributes.title))console.log(r.id,r.attributes.state,r.attributes.title)})'
```

Only titles come back in the list view; for close matches, `download` the candidate and compare root causes, not symptoms.
