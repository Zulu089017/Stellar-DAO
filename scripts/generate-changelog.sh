#!/usr/bin/env bash
# scripts/generate-changelog.sh
#
# Generate CHANGELOG.md from the last N commits, grouped by
# Conventional Commit type per docs/CONTRIBUTING.md.
#
# Usage:
#   bash scripts/generate-changelog.sh                # write CHANGELOG.md
#   bash scripts/generate-changelog.sh --dry-run      # write to stdout
#   bash scripts/generate-changelog.sh --check        # non-zero if stale
#   bash scripts/generate-changelog.sh --limit=20     # override commit count
#
# Requires: git, bash 4+ (associative arrays). The script derives
# its commit-link base from `git remote get-url origin`; if that
# remote isn't on github.com (Bitbucket / GitLab / local clone), or
# you want commit links to point at a canonical upstream rather than
# the local fork, set COMMIT_URL_BASE=https://github.com/your-org/
# your-repo/commit (FULL URL, not a bare path) before invoking.

set -euo pipefail

LIMIT=50
OUTPUT="CHANGELOG.md"
DRY=0
CHECK=0

# Commit link base — derive from `git remote get-url origin` so forks
# render links that actually exist. The env var override is a fallback
# for forks that want every link consumed at the canonical upstream
# repo (e.g. when cherry-picking back to the original forkchain).
# Single regex handles all four URL shapes:
#   git@github.com:org/repo
#   git@github.com:org/repo.git
#   https://github.com/org/repo
#   https://github.com/org/repo.git
# …and gracefully falls back to the upstream default if the remote
# isn't a GitHub URL (Bitbucket / GitLab / local-only test clone).
if [[ -z "${COMMIT_URL_BASE:-}" ]]; then
  remote_url="$(git config --get remote.origin.url 2>/dev/null || true)"
  if [[ "$remote_url" =~ github\.com[:/]([^/]+)/([^/]+)(\.git)?$ ]]; then
    COMMIT_URL_BASE="https://github.com/${BASH_REMATCH[1]}/${BASH_REMATCH[2]}/commit"
  else
    COMMIT_URL_BASE="https://github.com/Zulu089017/Stellar-DAO/commit"
  fi
fi

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --check)   CHECK=1; DRY=1 ;;
    --limit=*) LIMIT="${arg#*=}" ;;
    -h|--help) sed -n '3,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# Section order: conventional importance — user-visible first, then
# maintenance.
TYPE_LABELS=(
  "feat:Features"
  "fix:Bug Fixes"
  "perf:Performance"
  "refactor:Refactors"
  "docs:Documentation"
  "test:Tests"
  "build:Build"
  "ci:Continuous Integration"
  "chore:Chore"
)

declare -A SECTIONS
for label in "${TYPE_LABELS[@]}"; do
  SECTIONS["${label%%:*}"]=""
done
SECTIONS[other]=""

# Pull last N commits reachable from main. --no-merges keeps the
# auto-generated "# Conflicts:" banners and topic-branch-only merge
# commits out. We do NOT use `--first-parent` because that would
# drop the topic-branch individual commits when GitHub's default
# merge-commit strategy is in play (first-parent of main = the
# merge commit only) AND would empty the changelog entirely on a
# squash-merge strategy (every squash-merge commit has 2 parents
# so `--no-merges` filters them all). The grep filter additionally
# excludes `fixup!` / `squash!` / `amend!` rebase ghosts whose real
# version is already present in the 50-window under its final form.
#
# IMPORTANT: capture git's output into a string first and iterate via
# a here-string. A `git | grep | while` pipeline puts the while-loop
# in a subshell, which would silently drop every write to the
# SECTIONS associative array.
git_log=$(git log -"${LIMIT}" \
        --pretty=format:'%H%x1f%s' \
        --no-merges \
  | grep -vE '^[0-9a-f]+\x1f(Merge |Revert |fixup!|squash!|amend!)' || true)

# Parsing regex for `<type>[!]?(<optional-scope>): <subject>`. The
# optional `!?` group is the Conventional Commits BREAKING CHANGE
# marker. Kept as a variable (not inline) because some bash builds
# tokenize the unbalanced-paren in a `[[ $x =~ ... ]]` literal as an
# arithmetic-context expression and reject the script at parse time.
CC_RE='^([a-z]+)(!)?(?:\(([^)]+)\))?:[[:space:]]+(.*)$'

while IFS=$'\x1f' read -r hash subject; do
  [[ -z "$hash" || -z "$subject" ]] && continue
  breaking=""
  if [[ "$subject" =~ $CC_RE ]]; then
    type="${BASH_REMATCH[1]}"
    [[ -n "${BASH_REMATCH[2]}" ]] && breaking="⚠ BREAKING"
    scope="${BASH_REMATCH[3]:-}"
    rest="${BASH_REMATCH[4]}"
  else
    type="other"
    scope=""
    rest="$subject"
  fi
  # Unknown types (e.g. `wip:`, `style:`, typo'd types) fall to
  # "other" so the section list stays clean.
  [[ -z "${SECTIONS[$type]+_}" ]] && type="other"
  short="${hash:0:7}"
  url="${COMMIT_URL_BASE}/${short}"
  prefix=""
  [[ -n "$scope" ]] && prefix="**${scope}:** "
  [[ -n "$breaking" ]] && prefix="${breaking} — ${prefix}"
  SECTIONS[$type]+="- ${prefix}${rest} ([${short}](${url}))\n"
done <<< "$git_log"

rendered="# Changelog

All notable changes since the project adopted
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
— see \`docs/CONTRIBUTING.md\` for the type list.

Generated from the last \`${LIMIT}\` non-merge first-parent commits.
Refresh with \`pnpm changelog\` (or \`bash
scripts/generate-changelog.sh\` directly). The CI workflow runs
\`--check\` and fails the step (not the job — \`continue-on-error\`)
when this file is stale.

"

for label in "${TYPE_LABELS[@]}"; do
  type="${label%%:*}"
  body="${SECTIONS[$type]:-}"
  [[ -n "$body" ]] && rendered+="
## ${label##*:}

${body}
"
done

[[ -n "${SECTIONS[other]}" ]] && rendered+="
## Other

${SECTIONS[other]}
"

if [[ "$DRY" == 1 ]]; then
  # --check users want a quiet run so CI logs don't get flooded with
  # the entire intended changelog on a successful verification. Only
  # emit stdout for plain --dry-run (handy for `cat`ing a preview).
  if [[ "$CHECK" != 1 ]]; then
    printf '%s' "$rendered"
  elif [[ -f "$OUTPUT" ]]; then
    if diff -u <(printf '%s' "$rendered") "$OUTPUT" >/dev/null 2>&1; then
      echo "CHANGELOG.md is up to date (${LIMIT} commits)." >&2
    else
      echo "CHANGELOG.md is out of date — run 'pnpm changelog' and commit the refresh." >&2
      diff -u <(printf '%s' "$rendered") "$OUTPUT" >&2 || true
      exit 1
    fi
  else
    echo "CHANGELOG.md is missing — run 'pnpm changelog' to bootstrap it." >&2
    exit 1
  fi
else
  printf '%s' "$rendered" > "$OUTPUT"
  echo "wrote $OUTPUT" >&2
fi
