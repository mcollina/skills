---
name: pr-creation
description: Creating pull requests with gh CLI — body-file handling, description style, and waiting on CI
metadata:
  tags: github, gh-cli, pull-request, pr-body, ci, checks
---

# Creating pull requests with `gh`

## Always use `--body-file`, never `--body`

`--body` mangles newlines. Write the body to a file first:

```bash
cat > /tmp/pr-body.md <<'BODY'
Refactor plugin loading so skills are discovered from the registry instead of
being hardcoded.
BODY

gh pr create --base main --head <branch> --title "<title>" --body-file /tmp/pr-body.md
```

Pass `--base` and `--head` explicitly. Relying on the inferred base is how pull
requests end up targeting the wrong branch on a fork.

## Description style

Keep it short and in plain prose.

- A short description of the change, in prose
- **No** `## Summary`, `## Testing`, or similar headings
- **No** testing section
- Architecture changes may justify a longer description when extra context is
  genuinely needed

## After opening

Wait for CI and fix failures proactively rather than handing back a red pull
request:

```bash
gh pr checks <num> --watch 2>&1
```

## Unfamiliar commands

Validate with `gh help <command>` before relying on a flag in guidance. The
`gh` surface changes between releases, and invented flags fail confusingly.
