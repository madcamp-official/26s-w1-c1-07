#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check-standalone.sh — main 워크스페이스가 실험 폴더(design-lab / game-lab)에
# 의존하지 않는지(자립성) 검사한다.
#
# 배경: MADPUMP 머지는 lab 폴더의 코드를 main(client/·server/·shared/) "안으로
# 복사"하고 원본과의 연결을 끊는 vendor-in 방식이다(docs/MERGE_PLAN.md §2-0 불변식 A).
# 이 스크립트는 그 원칙이 깨졌는지 — 즉 main이 lab 폴더를 다시 가리키기 시작했는지
# — 를 기계적으로 잡아낸다. 하나라도 걸리면 exit 1.
#
# 정확도: "실제 모듈 참조"만 잡는다. 즉 **따옴표로 감싼 import 경로/alias 값**과
# workspaces·file: 의존성만 검사하고, 주석 속 산문(prose)에 lab 이름이 나오는 건
# 무시한다(오탐 방지). import 경로는 항상 따옴표 안에 있으므로 이 구분이 안전하다.
#
# 사용:  npm run check:standalone   (또는  bash scripts/check-standalone.sh)
# CI/pre-commit/빌드 전에 걸어두면 실수 배선이 머지되지 못한다.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."   # 리포 루트로

# 검사 대상 = main 실제 작업 워크스페이스의 소스 + 설정 파일(alias가 사는 곳).
SRC_DIRS=(client/src server/src shared/src)
CONFIG_FILES=(client/vite.config.ts client/tsconfig.json server/tsconfig.json shared/tsconfig.json tsconfig.json)

# 금지 패턴 — 모두 "따옴표 안의 모듈 스펙"에 한정:
#  (a) 따옴표 문자열이 design-lab / game-lab / game-test 를 포함  (import 경로·alias 값)
#  (b) 따옴표 바로 뒤 '@shared' 스펙  (design-lab 시안이 쓰던 alias). '@madpump/shared'는 미포함.
PATTERN_A="['\"][^'\"]*(design-lab|game-lab|game-test)[^'\"]*['\"]"
PATTERN_B="['\"]@shared(/|['\"])"

fail=0

scan() {   # $1 = 파일 또는 디렉터리
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
    echo "❌ [모듈참조] main 이 실험 폴더/구 alias를 가리킨다 ($target):"
    echo "$hits" | sed 's/^/     /'
    fail=1
  fi
}

# 1) 소스 + 설정 파일 스캔
for d in "${SRC_DIRS[@]}"; do scan "$d"; done
for f in "${CONFIG_FILES[@]}"; do scan "$f"; done

# 2) 루트 package.json workspaces 가 정확히 client/server/shared 인지
ws=$(node -e "const w=require('./package.json').workspaces||[]; console.log([...w].sort().join(','))")
if [ "$ws" != "client,server,shared" ]; then
  echo "❌ [workspaces] 루트 package.json workspaces 가 [client,server,shared] 가 아님: [$ws]"
  echo "     → design-lab / game-lab / ideas/* 를 루트 워크스페이스에 넣지 말 것."
  fail=1
fi

# 3) file: 로 lab 폴더를 의존성으로 끌어오는지
for pj in client/package.json server/package.json shared/package.json package.json; do
  [ -f "$pj" ] || continue
  if bad=$(grep -nE '"file:[^"]*(design-lab|game-lab)' "$pj" 2>/dev/null); then
    echo "❌ [의존성] $pj 가 lab 폴더를 file: 의존성으로 참조:"
    echo "$bad" | sed 's/^/     /'
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "✅ 자립성 OK — main(client/server/shared)은 design-lab / game-lab 을 참조하지 않는다."
  echo "   (lab 폴더를 삭제해도 main 은 빌드된다.)"
fi
exit $fail
