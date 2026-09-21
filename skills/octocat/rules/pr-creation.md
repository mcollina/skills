---
name: pr-creation
description: Creating pull requests with gh CLI — body-file handling, description style, and waiting on CI
metadata:
  tags: github, gh-cli, pull-request, pr-body, ci, checks
---

# Creating pull requests with `gh`

Opening a pull request is a publishing action. Draft the body, show the user
the exact command and the full text it would post, and wait for explicit
approval before running it. Drafting is not permission to post.

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

Watching CI is read-only, so do it without asking:

```bash
gh pr checks <num> --watch 2>&1
```

Investigate any failure and propose the fix. Committing and pushing it is a
separate mutation needing its own approval — the approval to open the PR does
not cover the next push.

## Unfamiliar commands

Validate with `gh help <command>` before relying on a flag in guidance. The
`gh` surface changes between releases, and invented flags fail confusingly.
