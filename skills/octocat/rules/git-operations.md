---
name: git-operations
description: Verification-first recovery paths for interactive rebase, merge conflict resolution, and branch cleanup
metadata:
  tags: git, rebase, merge-conflict, branch-cleanup, recovery, bisect, worktree
---

# Complex git operations

Each sequence ends in a verification step. Run it — the shared failure mode for
all of these is believing the operation succeeded when it did not.

## Interactive rebase

```bash
git rebase -i <base>
git log --oneline -n 10        # verify the result
```

On conflict: resolve → `git add <file>` → `git rebase --continue`.
Abort at any point with `git rebase --abort`.

## Merge conflict resolution

```bash
git status                     # find conflicted paths
git diff                       # inspect each one
# resolve every conflict marker
git add <resolved-file>
git merge --continue           # or: git rebase --continue
git status                     # confirm clean
```

## Branch cleanup

```bash
git branch --merged main
git branch -d <branch>
git push origin --delete <branch>
git fetch --prune
```

## Also available

Cherry-pick, bisect, worktrees, submodule and subtree management, and
repository archaeology with `git log` / `git blame` / `git show`. These behave
as documented upstream; no project-specific deviation applies, so use them
directly rather than looking for guidance here.
