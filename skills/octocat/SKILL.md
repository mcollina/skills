---
name: octocat
description: Performs git and GitHub work through the gh CLI. Use whenever a prompt contains a github.com URL — to an issue, pull request, commit, compare view, Actions run, release, or discussion — even with no other GitHub wording, and for creating or reviewing PRs and issues, interactive rebases, merge conflict resolution, branch cleanup, and Actions workflow debugging.
metadata:
  tags: git, github, gh-cli, pull-request, issues, rebase, merge-conflict, actions, branch-management
---

## Non-negotiables

1. **Never change git signing configuration.** Do not touch `user.signingkey`
   or signing mode in user or repo config. If signing is already enabled and
   working, use it. If it is not, proceed without it — do not enable it.
2. **Never add AI attribution.** No `Co-Authored-By: Claude` or any equivalent
   co-authorship or sign-off trailer naming a tool.
3. **Use `gh`, never the web interface.** Do not tell the user to click through
   github.com for something `gh` can do.
4. **A bare github.com URL is a sufficient trigger.** Treat the URL alone as
   the instruction, resolve it with `gh`/`git` before asking clarifying
   questions.

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
