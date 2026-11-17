#!/usr/bin/env bash
# AssetFlow 운영 메뉴 — 휴대폰 SSH 에서 짧은 명령 하나로 확인·설정·배포·저장소 재생성.
#
#   bash deploy/ops.sh                 # 번호 메뉴
#   bash deploy/ops.sh status          # 상태 요약 (sudo 불필요)
#   bash deploy/ops.sh dropfolder on   # 드롭 폴더 켜기 (sudo)
#   bash deploy/ops.sh dropfolder off  # 드롭 폴더 끄기 (sudo)
#   bash deploy/ops.sh deploy-now      # 자동 배포 1회 즉시 실행 (sudo)
#   bash deploy/ops.sh repo-reset      # 저장소 삭제·재생성 (파괴적, DELETE 확인)
#
# 저장소 밖 어떤 디렉터리에서 실행해도 동작한다(REPO 상수 고정).
set -Eeuo pipefail

REPO="/home/redbox9/assetflow-dev"
BRANCH="main"
SERVICE="assetflow.service"
DEPLOY_SERVICE="assetflow-deploy.service"
DEPLOY_TIMER="assetflow-deploy.timer"
HEALTH_URL="http://127.0.0.1:${SERVER_PORT:-8080}/health"
ENV_FILE="/opt/assetflow/assetflow.env"
JAR_FILE="/opt/assetflow/app.jar"
DROP_PATH="/home/redbox9/문서/재무_Finance"
STATE_FILE="$HOME/.local/state/assetflow/deployed-sha"
BACKUP_DIR="$HOME/backups"
GH_OWNER_REPO="lovebox0310/assetflow"
REPO_DESC="AssetFlow — personal finance workspace"

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:${PATH:-}"
# 인증 프롬프트로 멈추지 않게 한다(멈추면 SSH 세션이 그대로 물린다).
export GIT_TERMINAL_PROMPT=0

# ── 실패 지점 표시 ────────────────────────────────────────────────────────────
# set -e 로 중단될 때 "어느 단계인지" 를 항상 출력한다.
CURRENT_STEP="준비"
RESET_DONE=""
on_error() {
    local rc=$?
    printf '\n[중단] %s 에서 실패 (종료 코드 %s)\n' "$CURRENT_STEP" "$rc" >&2
    if [ -n "$RESET_DONE" ]; then
        printf '       완료된 단계: %s\n' "$RESET_DONE" >&2
    fi
}
trap on_error ERR

say() { printf '%s\n' "$*"; }

usage() {
    cat <<EOF
사용법:
  bash deploy/ops.sh                 번호 메뉴
  bash deploy/ops.sh status          상태 요약 (sudo 불필요)
  bash deploy/ops.sh dropfolder on   드롭 폴더 켜기 (sudo)
  bash deploy/ops.sh dropfolder off  드롭 폴더 끄기 (sudo)
  bash deploy/ops.sh deploy-now      자동 배포 1회 즉시 실행 (sudo)
  bash deploy/ops.sh repo-reset      저장소 삭제·재생성 (파괴적)
EOF
}

# ── 공용 도우미 ───────────────────────────────────────────────────────────────
require_sudo() {
    say "sudo 권한이 필요합니다. 비밀번호를 입력하세요."
    if ! sudo -v; then
        printf 'sudo 인증에 실패했습니다. 중단합니다.\n' >&2
        return 1
    fi
}

# /health 를 최대 6회(2초 간격) 확인한다. 앱 기동이 3초보다 오래 걸릴 수 있다.
wait_health() {
    local i=1 body
    while [ "$i" -le 6 ]; do
        if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)"; then
            say "  /health: $body"
            return 0
        fi
        [ "$i" -eq 6 ] && break
        sleep 2
        i=$((i + 1))
    done
    printf '  /health 응답 없음 (%s) — sudo systemctl status %s 로 확인하세요\n' \
        "$HEALTH_URL" "$SERVICE" >&2
    return 1
}

# ── 1) 상태 요약 ─────────────────────────────────────────────────────────────
cmd_status() {
    CURRENT_STEP="status"
    local local_sha remote_sha branch sha_file state timer_installed body ci_out

    say "===== AssetFlow 상태 ====="

    say "-- 최근 커밋"
    git -C "$REPO" log --oneline -3 2>/dev/null || say "  (git log 실패)"

    local_sha="$(git -C "$REPO" rev-parse --short=12 HEAD 2>/dev/null || echo "확인 불가")"
    branch="$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"
    if remote_sha="$(timeout 20 git -C "$REPO" ls-remote origin "refs/heads/$BRANCH" 2>/dev/null \
        | awk 'NR==1 { print substr($1,1,12) }')" && [ -n "$remote_sha" ]; then
        :
    else
        remote_sha="확인 불가(네트워크·인증)"
    fi
    say "-- SHA (로컬 $branch / origin/$BRANCH)"
    say "  로컬:   $local_sha"
    say "  원격:   $remote_sha"

    state="$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
    say "-- 서비스 $SERVICE: ${state:-unknown}"

    say "-- $HEALTH_URL"
    if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)"; then
        say "  $body"
    else
        say "  응답 없음(또는 기동 중)"
    fi

    say "-- 배포된 jar $JAR_FILE"
    if [ -f "$JAR_FILE" ]; then
        say "  $(stat -c '%y  %s bytes' "$JAR_FILE")"
    else
        say "  없음"
    fi

    say "-- 자동 배포 타이머 $DEPLOY_TIMER"
    timer_installed="$(systemctl list-unit-files "$DEPLOY_TIMER" --no-legend 2>/dev/null | wc -l || true)"
    timer_installed="${timer_installed//[[:space:]]/}"
    if [ "${timer_installed:-0}" -gt 0 ]; then
        systemctl list-timers "$DEPLOY_TIMER" --no-pager 2>/dev/null | sed -n '1,3p' \
            || say "  확인 불가"
    else
        say "  미설치"
    fi

    say "-- 마지막 배포 sha ($STATE_FILE)"
    sha_file="$(cat "$STATE_FILE" 2>/dev/null || true)"
    if [ -n "$sha_file" ]; then
        say "  ${sha_file:0:12}  $(git -C "$REPO" show -s --format='%s' "$sha_file" 2>/dev/null || echo '')"
    else
        say "  기록 없음"
    fi

    say "-- 최근 CI (gh run list --limit 1)"
    # --repo 를 붙여야 저장소 밖에서 실행해도 동작한다(gh 는 cwd 로 repo 를 찾는다).
    ci_out="$(timeout 25 gh run list --repo "$GH_OWNER_REPO" --limit 1 \
        --json workflowName,status,conclusion,headSha \
        --jq '.[] | "  \(.workflowName): \(.status) / \(.conclusion // "-") / \(.headSha[0:12])"' 2>/dev/null || true)"
    if [ -n "$ci_out" ]; then
        printf '%s\n' "$ci_out"
    else
        say "  조회 실패 또는 실행 기록 없음(gh 인증·네트워크 확인)"
    fi
}

# ── 2) 드롭 폴더 on/off ──────────────────────────────────────────────────────
# key 가 있으면 그 줄만 갱신하고, 없으면 파일 끝에 추가한다. 다른 줄은 그대로 둔다.
# ENV_FILE 은 root:600 이라 root 로 읽고 쓴다(값은 출력하지 않는다).
set_env_kv() {
    local key="$1" value="$2"
    sudo bash -s -- "$ENV_FILE" "$key" "$value" <<'EOS'
set -euo pipefail
file="$1"; key="$2"; value="$3"
if [ ! -f "$file" ]; then
    install -m 600 -o root -g root /dev/null "$file"
    echo "  생성: $file"
fi
mode="$(stat -c '%a' "$file")"
tmp="$(mktemp)"
found=0
while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
        "$key="*)
            printf '%s=%s\n' "$key" "$value"
            found=1
            ;;
        *)
            printf '%s\n' "$line"
            ;;
    esac
done < "$file" > "$tmp"
if [ "$found" -eq 0 ]; then
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
fi
install -m "$mode" -o root -g root "$tmp" "$file"
rm -f "$tmp"
echo "  갱신: $key=$value"
EOS
}

cmd_dropfolder() {
    local mode="${1:-}" enabled
    case "$mode" in
        on)  enabled="true" ;;
        off) enabled="false" ;;
        *)
            printf '사용법: bash deploy/ops.sh dropfolder on|off\n' >&2
            return 2
            ;;
    esac

    CURRENT_STEP="dropfolder $mode (sudo 확인)"
    require_sudo || return 1

    CURRENT_STEP="dropfolder $mode (env 파일 갱신)"
    say "-- $ENV_FILE 갱신"
    set_env_kv CARD_DROP_FOLDER_ENABLED "$enabled"
    set_env_kv CARD_DROP_FOLDER_PATH "$DROP_PATH"

    CURRENT_STEP="dropfolder $mode (서비스 재시작)"
    say "-- $SERVICE 재시작"
    sudo systemctl restart "$SERVICE"
    sleep 3

    CURRENT_STEP="dropfolder $mode (health 확인)"
    wait_health || return 1
    say "드롭 폴더 $mode 완료"
}

# ── 3) 지금 배포 ────────────────────────────────────────────────────────────
cmd_deploy_now() {
    CURRENT_STEP="deploy-now (sudo 확인)"
    require_sudo || return 1

    CURRENT_STEP="deploy-now (배포 서비스 시작)"
    say "-- $DEPLOY_SERVICE 시작 (결과는 로그로 확인)"
    sudo systemctl start "$DEPLOY_SERVICE"
    sleep 3

    CURRENT_STEP="deploy-now (로그)"
    say "-- journalctl -u assetflow-deploy -n 20"
    journalctl -u assetflow-deploy -n 20 --no-pager 2>/dev/null \
        || sudo journalctl -u assetflow-deploy -n 20 --no-pager
}

# ── 4) 저장소 삭제·재생성 (파괴적) ──────────────────────────────────────────
gh_repo_exists() { gh repo view "$GH_OWNER_REPO" --json name >/dev/null 2>&1; }

gh_has_delete_scope() { gh auth status 2>&1 | grep -qE "Token scopes:.*'delete_repo'"; }

reset_step() {
    CURRENT_STEP="repo-reset ${1}단계(${2})"
    printf '\n[%s/9] %s\n' "$1" "$2"
}

reset_done() {
    RESET_DONE="${RESET_DONE}${RESET_DONE:+ → }$1"
    say "  완료: $1"
}

cmd_repo_reset() {
    local ts bundle backup_root labels_json issues_json answer=""
    local url pull_count remote_sha local_sha tmpdir hits
    local existing name color desc labels_tsv label_count

    reset_step 1 "확인 (DELETE 입력 필요)"
    cat <<EOF
==============================================================
 저장소 삭제·재생성 — 되돌릴 수 없습니다
 대상: $GH_OWNER_REPO (GitHub)
 사라지는 것: 이슈·PR·라벨·Actions 이력·브랜치 보호 규칙
 남는 것: 로컬 $REPO 의 커밋·브랜치 (bundle 백업 후 다시 push)
==============================================================
계속하려면 DELETE 를 정확히 입력하세요 (그 외 입력은 취소):
EOF
    if ! read -r answer; then
        answer=""
    fi
    if [ "$answer" != "DELETE" ]; then
        say "취소했습니다. 아무것도 변경하지 않았습니다."
        return 0
    fi
    reset_done "1단계 확인"

    reset_step 2 "백업 (git bundle + 이슈·라벨 export)"
    ts="$(date +%Y%m%d-%H%M%S)"
    bundle="$BACKUP_DIR/assetflow-pre-reset-$ts.bundle"
    backup_root="$BACKUP_DIR/repo-reset-$ts"
    mkdir -p "$backup_root"
    git -C "$REPO" bundle create "$bundle" --all
    git -C "$REPO" bundle verify "$bundle" >/dev/null
    say "  bundle: $bundle"
    if gh_repo_exists; then
        gh issue list --repo "$GH_OWNER_REPO" --state all --limit 1000 \
            --json number,title,body,state,labels,createdAt,closedAt,url > "$backup_root/issues.json"
        gh label list --repo "$GH_OWNER_REPO" --limit 200 \
            --json name,color,description > "$backup_root/labels.json"
    else
        say "  원격에 이미 없음 — 이슈·라벨 export 생략(복구할 원격 데이터 없음)"
        printf '[]\n' > "$backup_root/issues.json"
        printf '[]\n' > "$backup_root/labels.json"
    fi
    say "  export: $backup_root"
    reset_done "2단계 백업"

    reset_step 3 "delete_repo 스코프 확인"
    if ! gh_has_delete_scope; then
        say "  delete_repo 스코프가 없습니다. 브라우저 승인 창이 열립니다."
        say "  (원격 SSH 세션이면 표시되는 코드를 브라우저에 입력하세요)"
        gh auth refresh -h github.com -s delete_repo
        if ! gh_has_delete_scope; then
            printf '  delete_repo 스코프를 얻지 못했습니다 — 중단합니다.\n' >&2
            exit 1
        fi
    fi
    say "  delete_repo 확인됨"
    reset_done "3단계 스코프"

    reset_step 4 "원격 저장소 삭제"
    if gh_repo_exists; then
        gh repo delete "$GH_OWNER_REPO" --yes
        say "  삭제됨: $GH_OWNER_REPO"
    else
        say "  이미 없음 — 건너뜀. 아래 5단계부터 이어서 진행합니다"
    fi
    reset_done "4단계 삭제"

    reset_step 5 "원격 저장소 생성"
    if gh_repo_exists; then
        say "  이미 존재 — 건너뜀"
    else
        gh repo create "$GH_OWNER_REPO" --public --description "$REPO_DESC"
    fi
    reset_done "5단계 생성"

    reset_step 6 "원격 URL 확인 후 전체 push"
    url="$(git -C "$REPO" remote get-url origin 2>/dev/null || true)"
    if [ -z "$url" ]; then
        printf '  origin 원격이 없습니다. 아래로 복구한 뒤 다시 실행하세요:\n' >&2
        printf '    git -C %s remote add origin git@github.com:%s.git\n' "$REPO" "$GH_OWNER_REPO" >&2
        exit 1
    fi
    if ! printf '%s' "$url" | grep -q "$GH_OWNER_REPO"; then
        printf '  origin URL 이 %s 가 아닙니다: %s\n' "$GH_OWNER_REPO" "$url" >&2
        printf '    git -C %s remote set-url origin git@github.com:%s.git\n' "$REPO" "$GH_OWNER_REPO" >&2
        exit 1
    fi
    say "  origin: $url"
    git -C "$REPO" push --all origin
    git -C "$REPO" push --tags origin
    reset_done "6단계 push"

    reset_step 7 "브랜치 보호 복구"
    gh api --method PUT "repos/$GH_OWNER_REPO/branches/$BRANCH/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "quality-gate" },
      { "context": "frontend-gate" },
      { "context": "backend-gate" }
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false,
  "block_creations": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
    say "  main 보호 규칙 적용됨 (quality-gate·frontend-gate·backend-gate, strict)"
    reset_done "7단계 보호 규칙"

    reset_step 8 "라벨 복원"
    labels_json="$backup_root/labels.json"
    label_count="$(jq 'length' "$labels_json" 2>/dev/null || echo 0)"
    if [ "${label_count:-0}" -gt 0 ]; then
        existing="$(gh label list --repo "$GH_OWNER_REPO" --limit 200 --json name --jq '.[].name' || true)"
        # jq 실패가 조용히 빈 루프로 끝나지 않도록 먼저 변수로 받는다.
        labels_tsv="$(jq -r '.[] | [.name, .color, (.description // "")] | @tsv' "$labels_json")"
        while IFS=$'\t' read -r name color desc; do
            [ -n "$name" ] || continue
            if printf '%s\n' "$existing" | grep -Fxq "$name"; then
                say "  skip(이미 있음): $name"
                continue
            fi
            if [ -n "$desc" ]; then
                gh label create "$name" --repo "$GH_OWNER_REPO" --color "$color" --description "$desc" >/dev/null
            else
                gh label create "$name" --repo "$GH_OWNER_REPO" --color "$color" >/dev/null
            fi
            say "  생성: $name"
        done <<< "$labels_tsv"
    else
        say "  백업에 라벨이 없음 — 건너뜀"
    fi
    reset_done "8단계 라벨"

    reset_step 9 "검증"
    if ! pull_count="$(timeout 20 git -C "$REPO" ls-remote origin 'refs/pull/*' 2>/dev/null | wc -l)"; then
        printf '  refs/pull/* 조회 실패\n' >&2
        exit 1
    fi
    pull_count="$(printf '%s' "$pull_count" | tr -d '[:space:]')"
    if [ "${pull_count:-x}" != "0" ]; then
        printf '  PR ref 가 남아 있습니다: %s 개\n' "$pull_count" >&2
        exit 1
    fi
    say "  PR ref: 0"

    remote_sha="$(timeout 20 git -C "$REPO" ls-remote origin "refs/heads/$BRANCH" 2>/dev/null \
        | awk 'NR==1 { print $1 }')"
    local_sha="$(git -C "$REPO" rev-parse HEAD)"
    if [ "$remote_sha" != "$local_sha" ]; then
        printf '  origin/%s(%s) != 로컬 HEAD(%s)\n' "$BRANCH" "${remote_sha:-없음}" "$local_sha" >&2
        exit 1
    fi
    say "  origin/$BRANCH = 로컬 HEAD = ${local_sha:0:12}"

    if [ -n "${SENSITIVE_EMAIL:-}" ]; then
        tmpdir="$(mktemp -d)"
        git clone --quiet "https://github.com/$GH_OWNER_REPO.git" "$tmpdir/check"
        hits="$(git -C "$tmpdir/check" log --all -S "$SENSITIVE_EMAIL" --oneline | wc -l)"
        hits="$(printf '%s' "$hits" | tr -d '[:space:]')"
        rm -rf "$tmpdir"
        if [ "${hits:-x}" != "0" ]; then
            printf '  개인 이메일 흔적이 남아 있습니다: %s 개 커밋\n' "$hits" >&2
            exit 1
        fi
        say "  SENSITIVE_EMAIL 흔적: 0"
    else
        say "  SENSITIVE_EMAIL 미설정 — 이메일 흔적 검사는 건너뜀"
    fi
    reset_done "9단계 검증"

    say ""
    say "저장소 재생성 완료"
    say "  bundle:        $bundle"
    say "  이슈·라벨 백업: $backup_root"
    say "  원격:          https://github.com/$GH_OWNER_REPO"
    say "  다음: 다음 타이머(10분)가 CI 통과 후 자동 배포. 즉시 배포는 bash deploy/ops.sh deploy-now"
}

# ── 메뉴 ────────────────────────────────────────────────────────────────────
show_menu() {
    cat <<'EOF'
=========================================
 AssetFlow 운영 메뉴
=========================================
 1) 상태 요약                    (status)
 2) 드롭 폴더 켜기/끄기           (dropfolder on|off)
 3) 지금 배포                    (deploy-now)
 4) 저장소 삭제·재생성 (파괴적)   (repo-reset)
 5) 종료
EOF
}

run_menu() {
    local choice="" mode=""
    while true; do
        say ""
        show_menu
        if ! read -r -p "번호 선택: " choice; then
            say ""
            return 0
        fi
        case "$choice" in
            1) cmd_status ;;
            2) if ! read -r -p "on 또는 off: " mode; then
                   say ""
                   return 0
               fi
               case "$mode" in
                   on|off) cmd_dropfolder "$mode" ;;
                   *) say "on 또는 off 만 입력할 수 있습니다." ;;
               esac ;;
            3) cmd_deploy_now ;;
            4) cmd_repo_reset ;;
            5) say "종료합니다."; return 0 ;;
            *) say "1~5 중 하나를 입력하세요." ;;
        esac
    done
}

main() {
    case "${1:-}" in
        "")               run_menu ;;
        status)           cmd_status ;;
        dropfolder)
            case "${2:-}" in
                on|off) cmd_dropfolder "$2" ;;
                *)
                    printf '사용법: bash deploy/ops.sh dropfolder on|off\n' >&2
                    exit 2
                    ;;
            esac
            ;;
        deploy-now)       cmd_deploy_now ;;
        repo-reset)       cmd_repo_reset ;;
        help|-h|--help)   usage ;;
        *)
            printf '알 수 없는 명령: %s\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
}

main "$@"
