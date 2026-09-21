---
name: octocat
description: Performs git and GitHub work through the gh CLI. Use whenever a prompt contains a github.com URL — to an issue, pull request, commit, compare view, Actions run, release, or discussion — even with no other GitHub wording, and for creating or reviewing PRs and issues, interactive rebases, merge conflict resolution, branch cleanup, and Actions workflow debugging.
metadata:
  tags: git, github, gh-cli, pull-request, issues, rebase, merge-conflict, actions, branch-management
---

## Non-negotiables

1. **Never mutate without explicit permission.** Inspect freely; stop before
   every write to the remote, to history, or to the working tree. Show the
   exact command and any text it would publish, then wait.
   - **Approval for one command is not standing approval for the next**, and
     approval to draft is not approval to post — the user must have read the
     text, not merely agreed to the action.
   - Classify by effect, not by how the command reads: `git checkout`,
     `switch`, and `stash` can discard uncommitted work; `git pull` merges
     where `fetch` does not; `gh api` writes as soon as it carries
     `-X POST`/`PATCH`/`DELETE`; `gh run rerun` and `gh workflow run` spend CI
     and fire side effects.
   - Where a repository's own `AGENTS.md` is stricter, it wins.

2. **Never change git signing configuration.** Do not touch `user.signingkey`
   or signing mode in user or repo config. If signing is already enabled and
   working, use it. If it is not, proceed without it — do not enable it.
3. **Never add AI attribution.** No `Co-Authored-By: Claude` or any equivalent
   co-authorship or sign-off trailer naming a tool.
4. **Use `gh`, never the web interface.** Do not tell the user to click through
   github.com for something `gh` can do.
5. **A bare github.com URL is a sufficient trigger.** Treat the URL alone as
   the instruction, and resolve it with the read-only commands above before
   asking clarifying questions.

## First move

Translate the URL or request into a `gh`/`git` inspection before proposing
anything:

```bash
gh issue view <url> --comments
gh pr view <url> --comments
gh pr diff <url>
gh run view <run-id> --log-failed
gh api repos/<owner>/<repo>/compare/<base>...<head>
```

Assess the actual repository state first. Most wrong answers here come from
acting on the prompt's description of the situation instead of the repository.

## Rules

- [rules/pr-creation.md](rules/pr-creation.md) — `gh pr create` with `--body-file`, description style, waiting on CI
- [rules/git-operations.md](rules/git-operations.md) — rebase, merge conflict, and branch cleanup sequences with verification steps

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Commit messages and PR descriptions for **nodejs/node**, which has its own strict rules → **nodejs-contributing**
- Pre-commit hook failures caused by TypeScript or lint errors → **typescript-magician**, **linting-neostandard-eslint9**
