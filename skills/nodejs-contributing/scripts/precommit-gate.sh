#!/usr/bin/env bash
#
# Runs the checks the nodejs/node CI lint jobs run, in the form CI runs them.
#
# This exists because the gate is easy to get wrong by hand in ways that pass
# locally and fail in CI:
#
#   * `make test` runs no linters on Unix, so a green test run proves nothing
#     about the Linters job.
#   * `make lint` skips Python, shell, and C++ formatting.
#   * Bare `make format-cpp` defaults to CLANG_FORMAT_START=HEAD and formats
#     only *staged* changes, while CI formats from the merge base — so code
#     committed earlier in the branch passes locally and fails in CI.
#   * `core-validate-commit` defaults to validating metadata, which enforces
#     PR-URL/Reviewed-By trailers that only exist after landing.
#
# Usage:
#   bash precommit-gate.sh              validate HEAD (run after committing)
#   bash precommit-gate.sh --staged     check the working tree (run before committing)
#   bash precommit-gate.sh --all        validate every commit on the branch
#   bash precommit-gate.sh --base <ref> override the merge-base reference
#   bash precommit-gate.sh --skip-lint  skip `make lint` (slow; checks only)
#
# Note: the C++ step runs `make format-cpp`, which REWRITES files in the
# working tree. That is the point of a formatter, but it means this script is
# not read-only when C++ sources have changed.

set -uo pipefail

MODE="head"
BASE_REF=""
SKIP_LINT=0
FAILURES=()
WARNINGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged) MODE="staged"; shift ;;
    --all) MODE="all"; shift ;;
    --base) BASE_REF="${2:-}"; shift 2 ;;
    --skip-lint) SKIP_LINT=1; shift ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$*"; }
ok() { printf '   ok   %s\n' "$*"; }
bad() { printf '   FAIL %s\n' "$*"; FAILURES+=("$*"); }
warn() { printf '   warn %s\n' "$*"; WARNINGS+=("$*"); }

# --- guard: this gate is specific to a nodejs/node checkout ------------------
# core-validate-commit's subsystem rule and the make targets below only make
# sense there, and running them elsewhere produces confusing failures.
if [[ ! -f node.gyp || ! -f src/node.cc ]]; then
  echo "error: run this from the root of a nodejs/node checkout" >&2
  echo "       (expected ./node.gyp and ./src/node.cc)" >&2
  exit 2
fi

# --- resolve the merge base CI would use -------------------------------------
if [[ -z "$BASE_REF" ]]; then
  for candidate in upstream/main origin/main upstream/master origin/master; do
    if git rev-parse --verify --quiet "$candidate" >/dev/null; then
      BASE_REF="$candidate"
      break
    fi
  done
fi

if [[ -z "$BASE_REF" ]]; then
  echo "error: could not find upstream/main or origin/main; pass --base <ref>" >&2
  exit 2
fi

MERGE_BASE="$(git merge-base HEAD "$BASE_REF")"
if [[ -z "$MERGE_BASE" ]]; then
  echo "error: no merge base between HEAD and $BASE_REF" >&2
  exit 2
fi

printf 'base: %s (%s)\n' "$BASE_REF" "${MERGE_BASE:0:12}"

CHANGED="$(git diff --name-only "$MERGE_BASE"...HEAD; git diff --name-only; git diff --cached --name-only)"
CHANGED="$(printf '%s\n' "$CHANGED" | sort -u | sed '/^$/d')"

has_changes() { printf '%s\n' "$CHANGED" | grep -qE "$1"; }

# --- stale build detection ---------------------------------------------------
# lib/ JavaScript is embedded into the binary by js2c at compile time, so tests
# run against stale code unless the binary is newer than the sources.
say "build freshness"
if [[ -x ./node ]]; then
  NEWER="$(find lib src -newer ./node -type f \( -name '*.js' -o -name '*.cc' -o -name '*.h' \) -print -quit 2>/dev/null)"
  if [[ -n "$NEWER" ]]; then
    warn "./node is older than sources (e.g. $NEWER) — rebuild before testing: make -j\$(nproc)"
  else
    ok "./node is newer than lib/ and src/"
  fi
else
  warn "no ./node binary found — build before testing: make -j\$(nproc)"
fi

# --- make lint ---------------------------------------------------------------
if [[ "$SKIP_LINT" -eq 1 ]]; then
  say "make lint (skipped)"
else
  say "make lint"
  if make lint; then
    ok "make lint clean"
  else
    bad "make lint reported problems"
  fi
fi

# --- C++ formatting, from the merge base like CI -----------------------------
if has_changes '\.(cc|h|cpp|hpp)$'; then
  say "C++ formatting (from merge base, as CI does)"
  if CLANG_FORMAT_START="$MERGE_BASE" make format-cpp; then
    if git --no-pager diff --exit-code >/dev/null; then
      ok "no formatting changes needed"
    else
      bad "format-cpp rewrote files — review 'git diff' and amend the formatting in"
      git --no-pager diff --stat
    fi
  else
    bad "make format-cpp failed to run (is clang-format available?)"
  fi
else
  say "C++ formatting (no C++ changes, skipped)"
fi

# --- targets make lint does not cover ----------------------------------------
if has_changes '\.py$'; then
  say "Python lint"
  make lint-py-build >/dev/null 2>&1
  if make lint-py; then ok "lint-py clean"; else bad "lint-py reported problems"; fi
fi

if has_changes '\.(sh|bash)$'; then
  say "shell lint"
  if command -v shellcheck >/dev/null; then
    if tools/lint-sh.mjs .; then ok "lint-sh clean"; else bad "lint-sh reported problems"; fi
  else
    warn "shellcheck not on PATH — CI will still run it"
  fi
fi

# --- commit messages ----------------------------------------------------------
validate_commit() {
  local sha="$1"
  local subject
  subject="$(git log -1 --format=%s "$sha")"

  if ! git log -1 --format=%B "$sha" | grep -q '^Signed-off-by: '; then
    bad "${sha:0:12} missing Signed-off-by — commit with -s (amend: git commit --amend --signoff)"
  fi
  if git log -1 --format=%B "$sha" | grep -qE '^(PR-URL|Reviewed-By): '; then
    bad "${sha:0:12} contains PR-URL/Reviewed-By — those are added when the change lands"
  fi
  if git log -1 --format=%B "$sha" | grep -qiE '^(Signed-off-by|Co-authored-by): .*(claude|copilot|gpt|codex|cursor|opencode|ai\b)'; then
    bad "${sha:0:12} signs off or co-authors as a tool — use Assisted-by: instead"
  fi

  if npx --no-install core-validate-commit --no-validate-metadata "$sha" >/tmp/cvc.$$ 2>&1 \
     || npx core-validate-commit --no-validate-metadata "$sha" >/tmp/cvc.$$ 2>&1; then
    ok "${sha:0:12} ${subject:0:60}"
  else
    bad "${sha:0:12} core-validate-commit failed"
    sed 's/^/        /' /tmp/cvc.$$
  fi
  rm -f /tmp/cvc.$$
}

case "$MODE" in
  staged)
    say "commit messages (staged mode — nothing committed yet, skipped)"
    if git diff --cached --quiet; then
      warn "nothing staged"
    else
      ok "$(git diff --cached --name-only | wc -l | tr -d ' ') file(s) staged; remember: git commit -s"
    fi
    ;;
  head)
    say "commit message (HEAD)"
    validate_commit HEAD
    ;;
  all)
    say "commit messages ($BASE_REF..HEAD)"
    mapfile -t SHAS < <(git rev-list "$MERGE_BASE"..HEAD)
    if [[ ${#SHAS[@]} -eq 0 ]]; then
      warn "no commits on the branch"
    fi
    for sha in "${SHAS[@]}"; do validate_commit "$sha"; done
    ;;
esac

# --- summary ------------------------------------------------------------------
echo
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  printf 'warnings (%d):\n' "${#WARNINGS[@]}"
  printf '  - %s\n' "${WARNINGS[@]}"
fi

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  printf 'FAILED (%d):\n' "${#FAILURES[@]}"
  printf '  - %s\n' "${FAILURES[@]}"
  echo
  echo "Fix these before pushing; each one is a red CI run and a force-push."
  exit 1
fi

echo "gate passed"
