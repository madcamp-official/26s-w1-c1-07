#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check-standalone.sh — checks that the main workspace does not depend on the
# experimental folders (design-lab / game-lab), i.e. its standalone-ness.
#
# Background: a MADCADE merge is a vendor-in that "copies" the lab folder code
# into main (client/·server/·shared/) and severs the link to the originals
# (docs/MERGE_PLAN.md §2-0 invariant A). This script mechanically detects whether
# that principle has been broken — i.e. whether main has started pointing back at
# the lab folders again. If anything is caught, exit 1.
#
# Accuracy: it only catches "real module references". That is, it checks only
# **quoted import paths / alias values** and workspaces·file: dependencies, and
# ignores lab names appearing in comment prose (to avoid false positives). Import
# paths are always inside quotes, so this distinction is safe.
#
# Usage:  npm run check:standalone   (or  bash scripts/check-standalone.sh)
# Wire it into CI / pre-commit / pre-build and mistaken wiring cannot be merged.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."   # to the repo root

# Scan targets = the source of main's actual working workspaces + config files (where aliases live).
SRC_DIRS=(client/src server/src shared/src)
CONFIG_FILES=(client/vite.config.ts client/tsconfig.json server/tsconfig.json shared/tsconfig.json tsconfig.json)

# Forbidden patterns — all limited to "module specs inside quotes":
#  (a) a quoted string containing design-lab / game-lab / game-test  (import path·alias value)
#  (b) an '@shared' spec right after a quote  (the alias the design-lab draft used). '@madcade/shared' is not included.
PATTERN_A="['\"][^'\"]*(design-lab|game-lab|game-test)[^'\"]*['\"]"
PATTERN_B="['\"]@shared(/|['\"])"

fail=0

scan() {   # $1 = file or directory
  local target="$1"
  [ -e "$target" ] || return 0
  local hits
  if [ -d "$target" ]; then
    hits=$(grep -rnE "$PATTERN_A|$PATTERN_B" "$target" \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
      --include='*.json' 2>/dev/null || true)
  else
    hits=$(grep -nE "$PATTERN_A|$PATTERN_B" "$target" 2>/dev/null || true)
  fi
  if [ -n "$hits" ]; then
    echo "❌ [module-ref] main points at an experimental folder / old alias ($target):"
    echo "$hits" | sed 's/^/     /'
    fail=1
  fi
}

# 1) Scan source + config files
for d in "${SRC_DIRS[@]}"; do scan "$d"; done
for f in "${CONFIG_FILES[@]}"; do scan "$f"; done

# 2) Whether the root package.json workspaces is exactly client/server/shared
ws=$(node -e "const w=require('./package.json').workspaces||[]; console.log([...w].sort().join(','))")
if [ "$ws" != "client,server,shared" ]; then
  echo "❌ [workspaces] root package.json workspaces is not [client,server,shared]: [$ws]"
  echo "     → Do not put design-lab / game-lab / ideas/* into the root workspaces."
  fail=1
fi

# 3) Whether a lab folder is pulled in as a dependency via file:
for pj in client/package.json server/package.json shared/package.json package.json; do
  [ -f "$pj" ] || continue
  if bad=$(grep -nE '"file:[^"]*(design-lab|game-lab)' "$pj" 2>/dev/null); then
    echo "❌ [dependency] $pj references a lab folder as a file: dependency:"
    echo "$bad" | sed 's/^/     /'
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "✅ standalone OK — main (client/server/shared) does not reference design-lab / game-lab."
  echo "   (main still builds even if the lab folders are deleted.)"
fi
exit $fail
