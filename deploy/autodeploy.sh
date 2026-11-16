#!/bin/bash
# AssetFlow 자동 배포 — main 이 전진했고 그 커밋의 CI(quality-gate 4잡)가 성공했을 때만 배포한다.
#
# 실행 주체: systemd timer (assetflow-deploy.timer, redbox9 사용자)
# 수동 실행: sudo systemctl start assetflow-deploy.service   (또는 직접 실행)
#
# 종료 코드
#   0  정상 종료 — 변경 없음 / CI 결과 없음 / CI 미통과 / 중복 실행 (배포하지 않음)
#   1  실패 — fetch/pull/sudo/deploy.sh 실패 (사람이 확인)
#   3  실패 — 작업트리가 dirty (자동 배포 중단, 사람이 정리)
#
# 배포하지 않는 조건은 모두 "로그를 남기고 종료" 이며, 조용히 성공으로 넘어가지 않는다.
set -euo pipefail

REPO="/home/redbox9/assetflow-dev"
BRANCH="main"
DEPLOY_SCRIPT="$REPO/deploy.sh"
STATE_DIR="$HOME/.local/state/assetflow"
STATE_FILE="$STATE_DIR/deployed-sha"
RUNTIME_LOCK="/run/lock/assetflow-deploy.lock"
FALLBACK_LOCK="$HOME/.cache/assetflow-autodeploy.lock"

# systemd 는 ~/.local/bin 을 PATH 에 넣지 않는다. gh 는 거기에 있고, git 이
# 인증 프롬프트로 멈추면 타이머가 30분 동안 물려 있으므로 둘 다 여기서 고정한다.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:${PATH:-}"
export GIT_TERMINAL_PROMPT=0
export LC_ALL=C

log() {
    printf '[%s] %s\n' "$(date '+%F %T')" "$*"
    logger -t assetflow-autodeploy -- "$*" 2>/dev/null || true
}

# 1) 중복 실행 방지. /run/lock 이 못 쓰는 환경이면 사용자 캐시로 떨어진다.
LOCK_FILE="$RUNTIME_LOCK"
if ! ( : >> "$LOCK_FILE" ) 2>/dev/null; then
    LOCK_FILE="$FALLBACK_LOCK"
    mkdir -p "$(dirname "$LOCK_FILE")"
fi
exec 9>> "$LOCK_FILE"
if ! flock -n 9; then
    log "중복 실행 방지: 이미 실행 중 ($LOCK_FILE) — 이번 주기는 건너뛴다"
    exit 0
fi

# 2) 저장소로 이동
cd "$REPO"

# 3) 작업트리가 dirty 면 자동 배포를 멈춘다. 로컬 수정이 pull 로 섞이면
#    무엇이 배포됐는지 설명할 수 없게 되기 때문이다.
DIRTY="$(git status --porcelain)"
if [ -n "$DIRTY" ]; then
    log "작업트리가 dirty — 자동 배포를 중단한다. 사람이 확인할 것: $REPO"
    printf '%s\n' "$DIRTY" | sed -n '1,20s/^/    /p'
    exit 3
fi

# 4) 원격 main 최신 sha
if ! git fetch --quiet origin "$BRANCH"; then
    log "git fetch 실패 — 배포하지 않는다"
    exit 1
fi
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

# 5) 변경 없음
if [ "$LOCAL" = "$REMOTE" ]; then
    log "변경 없음: 로컬 HEAD 와 origin/$BRANCH 가 같다 (${LOCAL:0:12}) — 배포하지 않는다"
    exit 0
fi
log "변경 감지: 로컬 ${LOCAL:0:12} → origin/$BRANCH ${REMOTE:0:12}"

# 4-1) 로컬에만 있는 커밋은 CI 가 본 적이 없다. 그대로 배포하면 게이트를 우회하므로
#      "origin/$BRANCH 이 로컬을 포함하는지"(fast-forward 가능한지)를 먼저 확인한다.
if ! git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
    log "로컬 $BRANCH 가 origin/$BRANCH 을 앞서거나 갈라졌다 — CI 가 검증하지 않은 커밋이라 배포하지 않는다"
    exit 1
fi

# 6) CI 게이트 — REMOTE 커밋의 최신 워크플로 실행이 success 일 때만 진행한다.
if [ -n "${GH_TOKEN:-}" ]; then
    log "CI 게이트: GH_TOKEN 환경변수로 조회한다"
else
    log "CI 게이트: GH_TOKEN 없음 — gh 키링 인증을 시도한다(비대화형에서 실패할 수 있음)"
fi

if ! CI_LINE="$(gh run list --branch "$BRANCH" --limit 1 \
        --json headSha,status,conclusion \
        --jq '.[0] | "\(.headSha)|\(.status)|\(.conclusion)"' 2>/dev/null)"; then
    log "CI 결과를 읽지 못했다(gh 실패) — 배포하지 않는다. GH_TOKEN 파일 또는 gh 인증을 확인할 것"
    exit 0
fi

CI_SHA="${CI_LINE%%|*}"
CI_REST="${CI_LINE#*|}"
CI_STATUS="${CI_REST%%|*}"
CI_CONCLUSION="${CI_REST#*|}"

if [ -z "$CI_SHA" ] || [ "$CI_SHA" = "null" ]; then
    log "CI 결과 없음: $BRANCH 에 실행 기록이 없다 — 배포하지 않는다"
    exit 0
fi
if [ "$CI_SHA" != "$REMOTE" ]; then
    log "CI 결과 없음: 최신 실행 sha ${CI_SHA:0:12} != 대상 ${REMOTE:0:12} — 배포하지 않는다"
    exit 0
fi
if [ "$CI_STATUS" != "completed" ]; then
    log "CI 진행 중(status=$CI_STATUS) — 다음 주기에 다시 본다"
    exit 0
fi
if [ "$CI_CONCLUSION" != "success" ]; then
    log "CI 미통과(conclusion=$CI_CONCLUSION) — 배포하지 않는다"
    exit 0
fi
log "CI 통과: ${REMOTE:0:12} (status=$CI_STATUS, conclusion=$CI_CONCLUSION)"

# 7) fast-forward 로만 당긴다. 갈라졌으면 pull 이 실패하고 배포도 하지 않는다.
if ! git pull --quiet --ff-only origin "$BRANCH"; then
    log "git pull --ff-only 실패 — 로컬 $BRANCH 가 갈라졌다. 사람이 확인할 것"
    exit 1
fi
PREV_SHA="unknown"
if [ -f "$STATE_FILE" ]; then
    PREV_SHA="$(cat "$STATE_FILE")"
fi
NEW_SHA="$(git rev-parse HEAD)"

# 7-1) 배포 직전 최종 확인: 실제로 당겨진 커밋이 CI 가 통과한 커밋과 같아야 한다.
if [ "$NEW_SHA" != "$REMOTE" ]; then
    log "pull 후 HEAD ${NEW_SHA:0:12} != CI 통과 커밋 ${REMOTE:0:12} — 배포하지 않는다"
    exit 1
fi

# 8) 실제 배포 — deploy.sh 는 root 권한이 필요하므로 sudoers 1줄로만 허용한다.
if ! sudo -n "$DEPLOY_SCRIPT"; then
    log "deploy.sh 실패(sudo -n) — 배포하지 못했다. sudoers 설정과 deploy.sh 로그를 확인할 것"
    exit 1
fi

# 9) 성공 기록
mkdir -p "$STATE_DIR"
printf '%s\n' "$NEW_SHA" > "$STATE_FILE"
log "배포 완료: 이전 ${PREV_SHA:0:12} → 현재 ${NEW_SHA:0:12} / $(date '+%F %T')"
