# AssetFlow 배포 런북 (홈서버)

현재 운영 환경은 **사무실 홈서버**(Ubuntu + PostgreSQL + systemd + Caddy)입니다.  
과거에 검토했던 Render + Vercel + Neon 조합은 [부록 A](#부록-a-render--vercel--neon-역사적-참고)에 남겨두었습니다.

## 1. 홈서버 구성

| 구성요소 | 내용 |
|---|---|
| 접속 | `ssh redbox9@redbox9.iptime.org -p 2222` (ipTIME DDNS, 공유기 2222→22 포워딩) |
| OS | Ubuntu 26.04, 15GB RAM |
| PostgreSQL | 18.6, `localhost:5432`, DB/유저 `assetflow` |
| Backend | `/opt/assetflow/app.jar` + systemd `assetflow.service` — postgres 프로필, `-Xmx512m`, Restart=always |
| Frontend | `/opt/assetflow/frontend` — Caddy 정적 서빙 |
| HTTPS | Caddy 역방향 프록시 — `https://redbox9.iptime.org` (자체 서명 인증서). 정식 인증서는 `iptime.org` CAA 차단으로 불가; 도메인 구입 시 Caddyfile 도메인만 교체하면 자동 발급으로 전환 |
| 방화벽 | ufw: 22/2222, 80, 443 허용. **5432 외부 개방 금지** |

공유기 포트포워딩(사용자 완료): 외부 80→80, 443→443 (192.168.0.102). 80은 ipTIME 원격 관리 서버(Httpd/1.0)가 선점해 404 응답 — HTTP-01 챌린지 불가, TLS-ALPN(443)도 CAA 차단으로 전환해 자체 서명으로 확정.

## 2. 필수 환경변수

`/etc/systemd/system/assetflow.service`에 설정되어 있습니다.

| 변수 | 용도 | 비고 |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://localhost:5432/assetflow` | postgres 프로필 활성화 시 사용 |
| `DB_USER` | PostgreSQL 계정 | |
| `DB_PASSWORD` | PostgreSQL 비밀번호 | |
| `JWT_SECRET` | JWT 서명 키 (32바이트 이상 랜덤 문자열) | **고정값 필수**. 누락 시 부팅마다 랜덤 키가 생성되어 모든 토큰 무효화 |
| `OWNER_EMAIL` | 단일 사용자 원장 소유자 이메일 | `users` 테이블 행과 일치해야 함 |
| `SERVER_PORT` | 8080 | |
| `ALLOWED_ORIGIN` | CORS 허용 출처(쉼표 구분) | 홈서버 동일 출처 시 생략 가능 |

`JWT_SECRET`은 `apps/backend/src/main/resources/application.yml`의 `app.jwt-secret: ${JWT_SECRET:}` 매핑을 통해 `TokenService`에 전달됩니다. 실제 JWT 발급·검증이 이미 구현되어 있으므로(2026-10-18), 운영 환경에서는 반드시 고정된 `JWT_SECRET`을 설정해야 합니다.

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
curl -sk --resolve redbox9.iptime.org:443:127.0.0.1 \
  https://redbox9.iptime.org/ | grep -o '<title>[^<]*</title>'
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
   scp -P 2222 assetflow-dump.sql redbox9@redbox9.iptime.org:/tmp/
   PGPASSWORD='<assetflow 비밀번호>' psql -h localhost -U assetflow -d assetflow -f /tmp/assetflow-dump.sql
   ```
3. **향후 VPS 등으로 이관할 때**: 같은 `pg_dump`/`psql` 절차 반복 — 계약 변화 없음

## 6. main 보호 규칙 (GitHub)

- 필수 상태 체크: `quality-gate`, `frontend-gate`, `backend-gate` (strict)
- 승인 요구: **제거됨** — 단독 개발자는 자신의 PR을 승인할 수 없어 병합 불가가 되기 때문(사용자 결정). 규칙 변경은 GitHub Settings → Branches 또는 `gh api -X PUT .../branches/main/protection`

---

## 부록 A: Render + Vercel + Neon (역사적 참고)

초기 스프린트 1에서는 **Neon(PostgreSQL) + Render(Backend) + Vercel(Frontend)** 조합을 검토했습니다. 예산(월 50,000원 이내)과 인프라 단순성을 비교한 결과, 2026-10-18에 **홈서버 운영**으로 전환했습니다. 아래 절차는 참고용입니다.

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
