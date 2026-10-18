# AssetFlow 배포 런북 (스프린트 1 리허설 - §12 "배포 순서" 집행용)

목표 조합: **Neon(PostgreSQL) + Render(Backend) + Vercel(Frontend)** — 월 비용 Free~Starter 범위(§12 상한 50,000원).

## 0. 현재 코드 상태

- 백엔드 원장은 **프로필 분기**: 기본값은 인메모리(테스트·CI), `--spring.profiles.active=postgres` + `DB_URL/DB_USER/DB_PASSWORD` 가 주어지면 `Postgres*Ledger` 가 실 DB 원장으로 동작한다(§39 단일 교체 지점 — API 계약 불변).
- DDL 단일 출처는 `apps/backend/db/schema.sql` 이며 postgres 프로필 부팅 시 Spring SQL init 이 자동 적용한다(이미 있으면 무시).
- 프론트는 `VITE_API_BASE_URL` 이 없으면 상대경로(dev 프록시), 있으면 절대 URL.

## 1. DB 생성 (Neon)

1. neon.tech 가입 → 새 프로젝트 생성 (지역: 서울 또는 가까운 리전)
2. 연결 문자열 확인: `postgresql://<user>:<password>@<host>/<db>?sslmode=require`
3. **dev/prod 분리**: 브랜치 또는 별도 프로젝트로 두 개 발급 (§12 2단계)
4. DDL 적용 — 로컬에서:
   ```bash
   psql "<연결 문자열>" -f apps/backend/db/schema.sql
   ```

## 2. Backend 배포 (Render)

1. render.com 가입 → New → Web Service → 이 저장소 연결
2. 설정:
   - Runtime: Java 21 (Render 기본 JDK 선택, 없으면 Dockerfile)
   - Build: `./gradlew clean build -x test`
   - Start: `./gradlew bootRun --args="--server.port=$PORT"` 또는 jar 실행
3. 환경변수:
   - `DB_URL`, `DB_USER`, `DB_PASSWORD` — 1단계 값
   - `ALLOWED_ORIGIN` — Vercel 도메인(3단계 후 확정, 쉼표 구분)
   - `SERVER_PORT` — Render가 주는 `$PORT` 사용 권장
4. **DB 연결(프로필 활성화)**: 시작 명령에 `--spring.profiles.active=postgres` 를 추가한다(예: `java -jar app.jar --spring.profiles.active=postgres`). 부팅 시 스키마가 자동 적용되고 원장이 Postgres 로 전환된다. 프로필 없이 뜨면 인메모리 원장으로 뜬다(부팅은 됨).
5. 배포 후 확인: `curl https://<render-domain>/health` → `{"status":"UP"}`

## 3. Frontend 배포 (Vercel)

1. vercel.com 가입 → Add New Project → 저장소 연결
2. Root Directory: `apps/frontend`, Build Command: `corepack pnpm install && corepack pnpm build`
3. 환경변수:
   - `VITE_API_BASE_URL` — 2단계 Render 도메인 (`https://...`, 슬래시 없이)
4. 배포 후 확인: 대시보드에서 로그인 → 실 데이터 렌더
5. 도메인 접속 허용: Render의 `ALLOWED_ORIGIN`에 Vercel 도메인 추가 → 재배포

## 4. 헬스체크 + 알람

- Render 대시보드의 Health Check Path: `/health`
- 알람: Render 이메일 알림 활성화 (무료 tier 기준, §12 6단계의 최소 충족)

## 5. 롤백 절차 리허설 (§12 7단계)

1. Render → Deployments 탭 → 직전 배포 선택 → **Rollback**
2. 롤백 후 `/health` 재확인
3. 기록: 롤백 소요 시간과 성공 여부를 `.ai/session-log.md`에 남긴다

## 6. main 보호 규칙 (GitHub 설정) — 2026-10-18 적용 완료

- 필수 상태 체크: `quality-gate`, `frontend-gate`, `backend-gate` (strict)
- 승인 요구: **제거됨** — 단독 개발자는 자신의 PR을 승인할 수 없어 병합 불가가 되기 때문(사용자 결정). 규칙 변경은 GitHub Settings → Branches 또는 `gh api -X PUT .../branches/main/protection`

## 7. 사무실 홈서버 구성 (2026-10-18 완료 — 카페24·가비아 대신 자체 장비 운영)

가비아 Gen2 월 20,000원이 예산(9,000원) 초과라, 사무실의 우분투 컴퓨터(Ubuntu 26.04, 15GB RAM)를 홈서버로 사용하기로 했다. 구성:

| 구성요소 | 내용 |
|---|---|
| 접속 | `ssh redbox9@redbox9.iptime.org -p 2222` (ipTIME DDNS, 공유기 2222→22 포워딩) — 배포용 키 등록 완료 |
| Postgres 18.6 | 서버 로컬 전용(5432 외부 미개방). DB `assetflow`, 계정 `assetflow`, 스키마·시드 적용 완료 |
| Backend | `/opt/assetflow/app.jar` + systemd(`assetflow.service`) — postgres 프로필, `-Xmx512m`, Restart=always |
| HTTPS | Caddy 역방향 프록시 — `https://redbox9.iptime.org` (자체 서명 인증서, 브라우저 경고 수락 필요). 정식 인증서는 iptime.org CAA 차단으로 불가 — 도메인 구입 시 Caddyfile 도메인만 교체하면 자동 발급으로 전환 |
| 방화벽 | ufw: 22/2222, 80, 443 허용. **5432 는 개방 금지** |

공유기 포트포워딩(사용자 완료): 외부 80→80, 443→443 (192.168.0.102). 80은 ipTIME 원격 관리 서버(Httpd/1.0)가 선점해 404 응답 — HTTP-01 챌린지 불가, TLS-ALPN(443)도 CAA 차단으로 전환해 자체 서명으로 확정.

### 7.1 데이터 이관 절차 (로컬 Windows → 홈서버)

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
3. **백업 자동화** (홈서버 cron): 매일 `pg_dump -U assetflow assetflow > ~/backup/assetflow-$(date +\%F).sql`, 7일분 보관
4. **나중에 카페24·VPS로 이관할 때**: 같은 pg_dump/복원 절차를 대상 서버에 반복한다 — 계약 변화 없음

### 7.2 백엔드 재배포 (새 jar 나올 때)

```bash
# 로컬: bootJar 빌드 후 전송
cd apps/backend && ./gradlew bootJar
scp -P 2222 build/libs/assetflow-backend-0.0.1-SNAPSHOT.jar \
  redbox9@redbox9.iptime.org:/tmp/assetflow.jar
# 서버: 교체·재기동
sudo mv /tmp/assetflow.jar /opt/assetflow/app.jar && sudo systemctl restart assetflow
```

## 8. 카페24·VPS 에 PostgreSQL 설치·이관 (참고용 — 현재는 홈서버 사용)

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

## 알려진 한계

- JWT_SECRET: 백엔드가 아직 실제 JWT를 발급하지 않는다(모크 토큰). 실발급 도입 시 `JWT_SECRET` 환경변수를 Render에 추가 (§13 환경변수 표준)
- Render 무료 인스턴스는 비활성 시 sleep → 첫 요청 지연. 월 1만~1.8천원 Starter로 해결(§12 예산선 내)
