---
name: security-advisory-lifecycle
description: Repository security advisory (GHSA) states and transitions from triage to draft to published, or closed, and how to read and change them with gh
metadata:
  tags: github, gh-cli, security-advisories, ghsa, private-vulnerability-reporting, lifecycle
---

# Repository security advisory lifecycle

A repository advisory moves **`triage` → `draft` → `published`**. At `triage` or `draft` it can instead become **`closed`**.

```
private report ──► triage ──accept──► draft ──publish──► published
                     │                  │
                     └──────close───────┴──► closed
```

| State | How it gets there | Visibility |
|---|---|---|
| `triage` | A private vulnerability report (`POST /repos/{owner}/{repo}/security-advisories/reports`) | Private: maintainers, reporter, advisory collaborators |
| `draft` | A maintainer accepts a triage report ("Accept and open as draft"), or creates an advisory directly (`POST /repos/{owner}/{repo}/security-advisories`) | Private |
| `published` | A maintainer publishes a draft | Public, and reviewed for the GitHub Advisory Database |
| `closed` | A maintainer closes a triage report or draft that is not a vulnerability or will not be pursued | Private; `closed_at` is set, `published_at` stays `null` |
| `withdrawn` | Set by GitHub, not by the maintainer | Read-only; `withdrawn_at` is set |

## Reading the state

```bash
set -o pipefail
repo='OWNER/REPO'
ghsa='GHSA-xxxx-xxxx-xxxx'
base="repos/$repo/security-advisories/$ghsa"
headers=(-H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28')

gh api "$base" "${headers[@]}" --jq '{state, created_at, published_at, closed_at, withdrawn_at}'

# Pending private reports. The list filter accepts triage, draft, published, closed (not withdrawn).
gh api "repos/$repo/security-advisories?state=triage&per_page=100" "${headers[@]}" --paginate \
  --jq '.[] | {ghsa_id, summary, created_at}'
```

## Changing the state

`PATCH /repos/{owner}/{repo}/security-advisories/{ghsa_id}` accepts only `state` values `draft`, `closed`, and `published`. `triage` and `withdrawn` cannot be set. It requires a repository admin, security manager, or advisory collaborator, with a `repo` or `repository_advisories:write` token.

```bash
# triage -> draft (accept the report). Only when the user asks to accept it.
gh api --method PATCH "$base" "${headers[@]}" -f state=draft

# triage or draft -> closed. Only when the user asks to close; comment why first.
gh api --method PATCH "$base" "${headers[@]}" -f state=closed
```

- A `closed` advisory can be reopened with `state=draft` (verified on an advisory created as a draft; reopening a closed triage report was not tested).
- Setting `triage` or `withdrawn` returns `422`.
- Starting a temporary private fork does not move an advisory out of `triage` ([private fork workflow](security-advisory-private-fork-prs.md)).
- Before closing a report, add a comment explaining the decision ([comments workflow](security-advisory-comments.md)).
- Close triage reports with the API, not the web interface. This includes duplicates, invalid reports, and reports that will not be pursued.
- Read the advisory back after each change and report the new `state`.

### Closing a duplicate report

Before you call a report a duplicate, list the repository's advisories in every state and compare root cause, affected code, and attack path against the earlier one. Matching titles are not enough. Then:

1. Comment on the duplicate. Thank the reporter, say an earlier private report covers the same issue and its fix is in progress, and ask them to keep the details private until the advisory is published.
2. If the earlier advisory is unpublished, do not name its GHSA ID, its reporter, or its private fork in the comment. The duplicate's reporter is not a collaborator on the earlier advisory.
3. Close the duplicate with `state=closed`. Credit stays with the earlier advisory's reporter.

## Publishing is public and one-way

Never publish unless the user explicitly asks to publish that advisory. Publishing:

- Discloses the advisory to everyone and submits it for the GitHub Advisory Database, which can trigger Dependabot alerts. Add the patched versions first.
- Deletes the advisory's temporary private fork. Merge fix PRs upstream from the advisory page before publishing.
- Is not reversible by the maintainer. There is no unpublish: an advisory published in error can only be deleted by GitHub Support.

Check the user's intent and the advisory's `vulnerabilities[].patched_versions` before running `gh api --method PATCH "$base" "${headers[@]}" -f state=published`.

## Verification boundary

Verified on October 17, 2026 against the [REST reference](https://docs.github.com/en/rest/security-advisories/repository-advisories), the public [OpenAPI description](https://github.com/github/rest-api-description), and the GitHub Docs pages on [managing private reports](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/managing-privately-reported-security-vulnerabilities) and [publishing](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/publishing-a-repository-security-advisory):

- The advisory schema's `state` enum is `published`, `closed`, `withdrawn`, `draft`, `triage`. The update schema's is `published`, `closed`, `draft`. The list filter's is `triage`, `draft`, `published`, `closed`.
- Private reports start in `triage`. Starting a private fork leaves them in `triage`. Accepting makes them a `draft`, and they can be closed from `triage`.
- Publishing deletes the temporary private fork. A published advisory can be deleted only through Support.

Live runs on `mcollina/skills` (October 2 and 17, 2026) with `gh` and an OAuth token carrying `repo`, on synthetic advisories:

- Created advisories start in `draft`; PATCH `state=closed` set `closed_at` and left `published_at: null`.
- PATCH `state=draft` on a `closed` advisory reopened it to `draft` and cleared `closed_at`.
- PATCH `state=triage` and `state=withdrawn` returned `422` with ``Invalid property /state: `triage` is not a possible value. Must be one of the following: published, closed, draft.``
- A repository admin cannot submit a private report to their own repository: `POST .../security-advisories/reports` returned `403 You are not authorized to report advisories in this repository via private vulnerability reporting`. Testing `triage` needs a report from a different account.

A live run on November 16, 2026 used a real private vulnerability report, submitted by another account to a public repository, with the same token and headers. The report was a duplicate:

- POST to the advisory's comments endpoint added the triage note while the report was still in `triage`.
- PATCH `state=closed` moved the report from `triage` to `closed` and set `closed_at`. Reading the advisory back confirmed `state: closed` and kept the comment.

The `triage` → `draft` PATCH, reopening a closed triage report, and publishing were not live-tested. Never publish a test advisory.
