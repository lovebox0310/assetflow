# AssetFlow 배포 런북 (홈서버)

현재 운영 환경은 **사무실 홈서버**(Ubuntu + PostgreSQL + systemd + Caddy)입니다.  
과거에 검토했던 Render + Vercel + Neon 조합은 [부록 A](#부록-a-render--vercel--neon-역사적-참고)에 남겨두었습니다.

## 1. 홈서버 구성

| 구성요소 | 내용 |
|---|---|
| 접속 | `ssh redbox9@***.ddns -p <SSH_PORT>` (ipTIME DDNS, 공유기 2222→22 포워딩) |
| OS | Ubuntu 26.04, 15GB RAM |
| PostgreSQL | 18.6, `localhost:5432`, DB/유저 `assetflow` |
| Backend | `/opt/assetflow/app.jar` + systemd `assetflow.service` — postgres 프로필, `-Xmx512m`, Restart=always |
| Frontend | `/opt/assetflow/frontend` — Caddy 정적 서빙 |
| HTTPS | Caddy 역방향 프록시 — `https://***.ddns` (자체 서명 인증서). 정식 인증서는 `iptime.org` CAA 차단으로 불가; 도메인 구입 시 Caddyfile 도메인만 교체하면 자동 발급으로 전환 |
| 방화벽 | ufw: 22/2222, 80, 443 허용. **5432 외부 개방 금지** |

공유기 포트포워딩(사용자 완료): 외부 80→80, 443→443 (***.***.***.***). 80은 ipTIME 원격 관리 서버(Httpd/1.0)가 선점해 404 응답 — HTTP-01 챌린지 불가, TLS-ALPN(443)도 CAA 차단으로 전환해 자체 서명으로 확정.

## 2. 필수 환경변수

`/etc/systemd/system/assetflow.service`에 설정되어 있습니다.

| 변수 | 용도 | 비고 |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://localhost:5432/assetflow` | postgres 프로필 활성화 시 사용 |
| `DB_USER` | PostgreSQL 계정 | |
| `DB_PASSWORD` | PostgreSQL 비밀번호 | |
| `JWT_SECRET` | JWT 서명 키 (32바이트 이상 랜덤 문자열) | **고정값 필수**. 누락 시 부팅마다 랜덤 키가 생성되어 모든 토큰 무효화 |
| `BANK_API_KEY` | bankapi.co.kr API Key (§61) | 이메일 가입 후 발급. 없으면 은행 연결 시 503 |
| `BANK_SECRET_KEY` | bankapi.co.kr Secret Key (§61) | 발급 화면에서 1회만 표시 — 안전한 곳에 보관 |
| `BANK_LINK_KEY` | 계좌번호 암호화 키 (AES/GCM) | **고정값 권장**. 비우면 `JWT_SECRET` 사용, 둘 다 없으면 기동마다 랜덤 |
| `BANK_API_BASE_URL` | `https://api.bankapi.co.kr` | 선택. 테스트 대역으로 바꿀 때만 |
| `OWNER_EMAIL` | 단일 사용자 원장 소유자 이메일 | `users` 테이블 행과 일치해야 함 |
| `SERVER_PORT` | 8080 | |
| `ALLOWED_ORIGIN` | CORS 허용 출처(쉼표 구분) | 홈서버 동일 출처 시 생략 가능 |

`JWT_SECRET`은 `apps/backend/src/main/resources/application.yml`의 `app.jwt-secret: ${JWT_SECRET:}` 매핑을 통해 `TokenService`에 전달됩니다. 실제 JWT 발급·검증이 이미 구현되어 있으므로(2026-10-18), 운영 환경에서는 반드시 고정된 `JWT_SECRET`을 설정해야 합니다.

### 2.1 은행 잔액 동기화 (§61)

은행 잔액 갱신은 무료 빠른조회 API(`api.bankapi.co.kr`)를 서버가 대신 호출합니다.

1. <https://bankapi.co.kr/signup> 이메일 가입 → API Key·Secret Key 발급
2. 키를 `/etc/assetflow/bank.env`(600 root:root)에 두고, 메인 유닛은 건드리지 않고
   drop-in 으로 읽게 한다 — 배포 스크립트가 자동 생성한다:
   ```
   /etc/systemd/system/assetflow.service.d/bank.conf
   [Service]
   EnvironmentFile=-/etc/assetflow/bank.env
   ```
   `EnvironmentFile` 은 systemd 가 root 권한으로 읽으므로 서비스 사용자 권한과 무관하다.
   **기존 `bank.env` 가 있으면 재배포해도 덮어쓰지 않는다** — `BANK_LINK_KEY` 가 바뀌면
   저장된 계좌번호를 복호화할 수 없어 전부 재연결해야 하기 때문이다.
3. 동기화할 계좌를 해당 은행의 **빠른조회(간편조회)** 에 등록
4. 이 서버가 **국내 IP** 인지 확인 — 이 API 는 해외 IP 를 403 으로 거절한다
   (홈서버 `***.ddns` 는 국내라 가능)

계좌 비밀번호·생년월일은 저장하지 않고 요청에만 쓰며, 계좌번호만 `BANK_LINK_KEY` 로
암호화해 `bank_account_links` 에 저장합니다. 한도는 계좌당 5분에 1회다.

## 3. 빌드·배포

### 3.1 사전 준비

로컬(또는 CI)에서 빌드에 필요한 JDK는 `~/.gradle/jdks/eclipse_adoptium-21-amd64-linux.2`에 있습니다.

```bash
# 1) 백엔드 빌드
cd apps/backend
JAVA_HOME=$HOME/.gradle/jdks/eclipse_adoptium-21-amd64-linux.2 ./gradlew bootJar -x test

# 2) 프론트엔드 빌드
cd ../frontend
pnpm build
```

### 3.2 스테이징·배포

```bash
# 3) 스테이징
mkdir -p /tmp/opencode/deploy
cp apps/backend/build/libs/assetflow-backend-0.0.1-SNAPSHOT.jar /tmp/opencode/deploy/app.jar
rsync -a --delete apps/frontend/dist/ /tmp/opencode/deploy/dist/

# 4) 서버에서 sudo로 배포 스크립트 실행
sudo bash /tmp/opencode/deploy-assetflow.sh
```

`/tmp/opencode/deploy-assetflow.sh`는 다음 순서로 동작합니다:

1. BE jar + FE 디렉터리 백업
2. BE jar 원자적 교체
3. `assetflow.service` 재시작 후 `/health` 응답 대기(최대 120초)
4. FE 정적 파일 `rsync`
5. 헬스·타이틀·번들 검증

실패 시 BE는 백업 jar로 자동 롤백됩니다.

### 3.3 배포 후 검증

```bash
# BE 헬스
curl http://127.0.0.1:8080/health

# FE 타이틀 + 번들
curl -sk --resolve ***.ddns:443:127.0.0.1 \
  https://***.ddns/ | grep -o '<title>[^<]*</title>'
```

## 4. 롤백 절차

스크립트가 생성한 백업 목록을 확인합니다.

```bash
ls -la /opt/assetflow/app.jar.bak-* /opt/assetflow/backup-frontend-*/
```

수동 롤백:

```bash
sudo systemctl stop assetflow
sudo cp /opt/assetflow/app.jar.bak-<STAMP> /opt/assetflow/app.jar
sudo rsync -a --delete /opt/assetflow/backup-frontend-<STAMP>/frontend/ /opt/assetflow/frontend/
sudo systemctl start assetflow
curl http://127.0.0.1:8080/health
```

롤백 소요 시간과 성공 여부는 `.ai/session-log.md`에 기록합니다.

## 5. DB 백업·복원

### 5.1 백업

- **자동**: 매일 03:15 cron (`/etc/cron.d/assetflow-backup` → `/opt/assetflow/backup.sh`)
- **저장**: `/var/backups/assetflow/assetflow-YYYY-MM-DD.sql.gz`
- **보관**: 7일분
- **수동**: `sudo -u postgres /opt/assetflow/backup.sh`
- **복원 검증 이력**: 2026-10-18 임시 DB 복원 → 1,341행 일치 확인

### 5.2 복원

```bash
sudo systemctl stop assetflow
zcat /var/backups/assetflow/assetflow-YYYY-MM-DD.sql.gz | \
  sudo -u postgres psql -U assetflow -d assetflow
sudo systemctl start assetflow
curl http://127.0.0.1:8080/health
```

### 5.3 데이터 이관 (로컬 Windows → 홈서버)
1. **로컬 덤프 생성** (Windows):
   ```bash
   D:/study/pgsql/pgsql/bin/pg_dump.exe -h localhost -U postgres -d assetflow \
     --no-owner --no-privileges --clean --if-exists -F p -f assetflow-dump.sql
   ```
2. **전송·복원** (홈서버):
   ```bash
   scp -P 2222 assetflow-dump.sql redbox9@***.ddns:/tmp/
   PGPASSWORD='<assetflow 비밀번호>' psql -h localhost -U assetflow -d assetflow -f /tmp/assetflow-dump.sql
   ```
3. **향후 VPS 등으로 이관할 때**: 같은 `pg_dump`/`psql` 절차 반복 — 계약 변화 없음

### 5.4 카드내역 중복 정리 확인 (CARD-MERGE-1)

`apps/backend/db/schema.sql` 끝에 1회성 정리 SQL 이 들어 있습니다. 배포(재기동) 때
`spring.sql.init` 이 schema.sql 을 다시 적용하면서 함께 수행되고, 이후에는 0건입니다.
삭제 후보는 **`source='unknown'`(출처를 모르는 기존 행)뿐**이고, 같은
(카드사·이용일·금액) 그룹에서 가맹점명이 같거나 한쪽이 다른 쪽을 포함할 때만 지웁니다.
새로 들어온 `csv`/`email` 행은 건드리지 않습니다 — 같은 날 같은 가맹점·금액의 정당한
2건이 사라지지 않게 하기 위해서입니다.

**정리 전 — 중복 그룹 확인** (배포 전후 어느 때나 읽기 전용):

```sql
SELECT COALESCE(card_company, '') AS card_company,
       approved_at, gross_amount,
       array_agg(id ORDER BY id)           AS ids,
       array_agg(merchant_name ORDER BY id) AS merchants,
       array_agg(source ORDER BY id)        AS sources
FROM card_imports
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY approved_at, gross_amount;
```

같은 내용을 API 로도 볼 수 있습니다(삭제 없음):

```bash
curl -sk -H "Authorization: Bearer <JWT>" \
  "https://***.ddns/api/v1/assets/card-imports/duplicates?month=2026-10"
```

**정리 후 — 출처 분포와 잔여 중복**:

```sql
-- 출처별 행 수. 기대: unknown(기존 행) / csv(업로드) / email(이메일)
SELECT source, count(*) FROM card_imports GROUP BY source ORDER BY source;

-- 위 '중복 그룹 확인' 쿼리를 다시 실행해, 남은 그룹이 모두 가맹점이 다른
-- (합치면 안 되는) 거래인지 눈으로 확인한다.
```

정리 SQL 은 여러 번 실행해도 안전합니다(두 번째부터는 `DELETE 0`).

## 6. main 보호 규칙 (GitHub)

- 필수 상태 체크: `quality-gate`, `frontend-gate`, `backend-gate` (strict)
- 승인 요구: **제거됨** — 단독 개발자는 자신의 PR을 승인할 수 없어 병합 불가가 되기 때문(사용자 결정). 규칙 변경은 GitHub Settings → Branches 또는 `gh api -X PUT .../branches/main/protection`

## 7. 자동 배포 (선택)

main 이 전진했고 **그 커밋의 CI 4잡(quality-gate·frontend-gate·e2e-gate·backend-gate)이 모두 성공**했을 때만 서버에 배포한다. 10분마다 도는 systemd 타이머가 판단하고, 실제 배포는 지금 쓰는 `deploy.sh` 가 한다.

```
assetflow-deploy.timer (10분)
        │  systemd, User=redbox9
        ▼
deploy/autodeploy.sh ── dirty? ────────────→ 중단(사람 확인)
        │
        ├─ git fetch → HEAD == origin/main ? ─→ 종료(변경 없음)
        │
        ├─ 로컬에만 있는 커밋? ───────────────→ 중단(CI 미검증 커밋)
        │
        ├─ gh run list (main 최신 실행)
        │     headSha != origin/main ────────→ 중단(CI 결과 없음)
        │     status != completed ───────────→ 중단(진행 중)
        │     conclusion != success ──────── → 중단(CI 미통과)
        ▼
   git pull --ff-only origin main
        ▼
   sudo -n deploy.sh  (root: 빌드·/opt/assetflow 교체·서비스 재시작)
        ▼
   ~/.local/state/assetflow/deployed-sha 기록 + journal 로그
```

왜 이렇게 하는가: 서버가 스스로 pull 해서 코드를 실행하는 구조이므로, **CI 성공 게이트 없이는 자동 배포를 켜지 않는다**. 갈라진 이력은 `--ff-only` 로 거부하고, 로컬 수정(dirty)이 있으면 무엇이 배포됐는지 설명할 수 없으므로 멈춘다.

### 7.1 설치 (사용자가 sudo로 1회)

저장소에는 파일만 있고, 설치는 아래 명령을 **사용자가 직접** 실행한다.

```bash
sudo install -d -m 755 /etc/systemd/system
sudo cp /home/redbox9/assetflow-dev/deploy/systemd/assetflow-deploy.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now assetflow-deploy.timer
sudo systemctl list-timers assetflow-deploy.timer
```

### 7.2 sudoers 1줄 (deploy.sh 만 무암호 허용)

`sudo -n deploy.sh` 가 동작하려면 규칙이 필요하다. **deploy.sh 한 파일에만** 허용한다.

```bash
sudo visudo -f /etc/sudoers.d/assetflow-deploy
```

```sudoers
redbox9 ALL=(root) NOPASSWD: /home/redbox9/assetflow-dev/deploy.sh
```

```bash
sudo chmod 440 /etc/sudoers.d/assetflow-deploy   # 반드시 필요 (visudo 는 안 해준다)
sudo -l -U redbox9 | grep deploy.sh              # 적용 확인
```

- 경로는 **정확히** 일치해야 한다. `deploy.sh` 를 옮기거나 이름을 바꾸면 규칙도 고쳐야 하고, 그전까지 자동 배포는 `deploy.sh 실패(sudo -n)` 로 멈춘다.
- 규칙을 `deploy.sh` 전체 경로로 좁혔으므로 이 사용자는 그 외 root 명령을 무암호로 못 한다.

### 7.3 토큰 파일 (CI 게이트용, 선택)

`gh` 는 지금 키링(대화형 로그인)으로 동작하지만, systemd 는 세션 키링에 접근하지 못해 `gh run list` 가 실패할 수 있다. 그 경우 자동 배포는 **배포하지 않고 종료**한다. 토큰 파일을 두면 그 문제가 없어진다.

```bash
mkdir -p ~/.config/assetflow
printf 'GH_TOKEN=%s\n' "$(gh auth token)" > ~/.config/assetflow/gh.env
chmod 600 ~/.config/assetflow/gh.env
```

- 파일은 `GH_TOKEN=...` **한 줄**이어야 한다(`EnvironmentFile` 형식).
- `gh auth token` 은 키링을 쓰므로 **로그인된 대화형 세션에서** 만들어야 한다.
- 유닛은 `EnvironmentFile=-/home/redbox9/.config/assetflow/gh.env` 로 읽는다(`-` 는 파일이 없어도 기동).
- 토큰은 저장소에 커밋하지 않는다 — 저장소 밖(`~/`) 경로에 두고, 실수로 저장소에 넣더라도 `.env`/`.env.*` 는 ignore 대상이다.

### 7.4 로그·상태·수동 실행·중지

```bash
journalctl -u assetflow-deploy -n 80 --no-pager     # 실행 로그
sudo systemctl start assetflow-deploy.service       # 즉시 1회 실행
sudo systemctl list-timers assetflow-deploy.timer   # 다음 실행 시각
cat ~/.local/state/assetflow/deployed-sha           # 마지막으로 배포된 커밋
sudo systemctl disable --now assetflow-deploy.timer # 자동 배포 끄기
```

로그는 journal 과 `logger -t assetflow-autodeploy`(syslog) 양쪽에 남는다. `systemctl start` 는 결과를 기다리지 않으므로 실행 후 `journalctl` 로 확인한다.

완전히 해제하려면 타이머를 끈 뒤 유닛 파일과 sudoers 규칙을 지운다.

```bash
sudo systemctl disable --now assetflow-deploy.timer
sudo rm /etc/systemd/system/assetflow-deploy.{service,timer}
sudo rm /etc/sudoers.d/assetflow-deploy
sudo systemctl daemon-reload
```

### 7.5 배포하지 않고 끝나는 경우 (스크립트 분기)

| 상황 | 판단 | 종료 코드 | 배포 |
|---|---|---|---|
| 작업트리가 dirty | 로컬 수정이 섞이면 배포 내용을 설명할 수 없다 | 3 | 안 함 |
| `HEAD == origin/main` | 변경 없음 | 0 | 안 함 |
| 로컬 main 이 `origin/main` 을 앞섬·갈라짐 | CI 가 본 적 없는 커밋이다(게이트 우회 금지) | 1 | 안 함 |
| CI 실행의 `headSha != origin/main` | 그 커밋의 CI 결과가 아직 없다 | 0 | 안 함 |
| CI `status != completed` | 진행 중 — 다음 주기에 다시 본다 | 0 | 안 함 |
| CI `conclusion != success` | 미통과 | 0 | 안 함 |
| `gh run list` 실패(토큰·키링 없음) | CI 를 확인할 수 없다 | 0 | 안 함 |
| `git fetch`/`pull --ff-only` 실패 | 네트워크 또는 이력 갈라짐 | 1 | 안 함 |
| `sudo -n deploy.sh` 실패 | sudoers 미설정, 빌드 실패 등 | 1 | 안 함 |

0 은 "이번 주기는 할 일이 없었다", 1·3 은 "사람이 봐야 한다"로 구분한다. 3 은 작업트리를 정리할 때까지 매 주기 반복되므로 `list-timers` 로는 보이지 않아도 `systemctl status assetflow-deploy` 에 실패로 남는다. `git pull` 직후 HEAD 가 CI 통과 커밋과 다르면(정상 흐름에서는 나올 수 없음) 역시 1 로 멈추고 배포하지 않는다.

### 7.6 롤백

1. **코드로 되돌리기(권장)** — main 에 `git revert` 커밋을 올린다. CI 가 통과하면 다음 타이머가 그 커밋을 배포한다.
   ```bash
   git revert <문제 커밋> && git push origin main
   ```
   `app.jar` 백업은 `deploy.sh` 가 `/opt/assetflow/app.jar.bak-<STAMP>` 로 남기므로, 급하면 §4 의 수동 롤백을 그대로 쓴다.
2. **자동 배포를 멈추고 수동 배포** — 되돌릴 커밋이 CI 를 통과하지 못하는 상황이면 타이머를 먼저 끈다.
   ```bash
   sudo systemctl stop assetflow-deploy.timer
   sudo systemctl start assetflow-deploy.service   # 필요하면 1회만
   ```

### 7.7 보안 주의

- 이 구성은 **main 에 머지된 코드가 서버에서 곧바로 실행된다**는 뜻이다. main 에 올릴 수 있는 사람 = 서버에서 코드를 실행할 수 있는 사람이다.
- 그래서 **CI 성공 게이트를 끄지 않는다**. 게이트를 빼면 검증되지 않은 커밋이 자동 실행된다.
- sudoers 는 **`deploy.sh` 한 파일에만** 연다. `NOPASSWD: ALL` 이나 스크립트 디렉터리 전체를 열면 그 경로에 파일을 쓸 수 있는 사람이 root 를 얻는다.
- `deploy/autodeploy.sh` 자체를 고치는 커밋은 실행 중인 스크립트를 교체할 수 있다. 그런 커밋을 배포할 때는 타이머를 잠시 끄고 수동 배포하는 편이 안전하다.
- 저장소가 **공개**라면 이 구성을 권하지 않는다. 배포 경로·계정·sudoers 규칙이 모두 공개되고, main 에 push 할 수 있는 모든 경로가 서버 실행 권한이 된다.

---

## 부록 A: Render + Vercel + Neon (역사적 참고)

초기 스프린트 1에서는 **Neon(PostgreSQL) + Render(Backend) + Vercel(Frontend)** 조합을 검토했습니다. 예산(월 ***원 이내)과 인프라 단순성을 비교한 결과, 2026-10-18에 **홈서버 운영**으로 전환했습니다. 아래 절차는 참고용입니다.

### A.1 DB 생성 (Neon)

1. neon.tech 가입 → 새 프로젝트 생성 (지역: 서울 또는 가까운 리전)
2. 연결 문자열 확인: `postgresql://<user>:<password>@<host>/<db>?sslmode=require`
3. **dev/prod 분리**: 브랜치 또는 별도 프로젝트로 두 개 발급
4. DDL 적용:
   ```bash
   psql "<연결 문자열>" -f apps/backend/db/schema.sql
   ```

### A.2 Backend 배포 (Render)

1. render.com 가입 → New → Web Service → 이 저장소 연결
2. 설정:
   - Runtime: Java 21
   - Build: `./gradlew clean build -x test`
   - Start: `java -jar app.jar --spring.profiles.active=postgres`
3. 환경변수: `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `ALLOWED_ORIGIN`, `SERVER_PORT`
4. 배포 후 확인: `curl https://<render-domain>/health` → `{"status":"UP"}`

### A.3 Frontend 배포 (Vercel)

1. vercel.com 가입 → Add New Project → 저장소 연결
2. Root Directory: `apps/frontend`, Build Command: `corepack pnpm install && corepack pnpm build`
3. 환경변수: `VITE_API_BASE_URL` — Render 도메인
4. Render의 `ALLOWED_ORIGIN`에 Vercel 도메인 추가 → 재배포

### A.4 Render 물리 인스턴스 한계

- Render 물리 인스턴스는 비활성 시 sleep → 첫 요청 지연.
- 월 1만~1.8천원 Starter tier로 해결 가능(§12 예산선 내).
- 현재는 홈서버를 사용하므로 해당 한계는 적용되지 않음.

---

## 부록 B: VPS 이관

VPS 를 쓰게 될 경우의 절차. 원본 진리는 로컬 DB, 대상 서버는 이관 대상이다.

1. **VPS 설치**:
   ```bash
   sudo apt update && sudo apt install -y postgresql-16
   sudo -u postgres psql -c "CREATE USER assetflow WITH PASSWORD '<강한 비밀번호>';"
   sudo -u postgres psql -c "CREATE DATABASE assetflow OWNER assetflow;"
   ```
2. **스키마 적용**(저장소를 clone 했다면):
   ```bash
   psql -U assetflow -d assetflow -f apps/backend/db/schema.sql
   ```
3. **로컬에서 덤프 생성**(Windows, 로컬 Postgres 17):
   ```bash
   D:/study/pgsql/pgsql/bin/pg_dump.exe -h localhost -U postgres -d assetflow \
     --no-owner --no-privileges --clean --if-exists -F p -f assetflow-dump.sql
   ```
4. **덤프 전송·복원**:
   ```bash
   scp assetflow-dump.sql <vps사용자>@<vps주소>:/tmp/
   psql -U assetflow -d assetflow -f /tmp/assetflow-dump.sql   # VPS 에서
   ```
5. **보안 설정**:
   - `postgresql.conf`: `listen_addresses = 'localhost'` 유지 — 백엔드와 같은 서버면 외부 노출 불필요
   - 외부 접속이 필요하면 `pg_hba.conf` 에 특정 IP + `scram-sha-256` 만 허용
   - 방화벽: 5432 외부 개방은 하지 않는다 — 백엔드가 서버 안에서 localhost 로 접속
6. **백엔드 연결**: 백엔드를 같은 서버에 두고 `DB_URL=jdbc:postgresql://localhost:5432/assetflow`
7. **정기 백업**: cron 에 `pg_dump` 매일 1회, 7일분 보관
