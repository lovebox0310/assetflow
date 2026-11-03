# backend workspace

Backend implementation area for AssetFlow.

## Planned stack

- Java
- Spring Boot
- PostgreSQL

## Sprint 1 target APIs

All three are implemented (mock ledger, spec in §38 of `.ai/project.md`):

- GET /api/v1/me — current user (mock single user)
- GET /api/v1/dashboard/summary — dashboard rows (same shape as the FE `DashboardData`)
- GET /api/v1/dashboard/cashflow?months=3 — last N months, 1..12, newest first
- GET /api/v1/dashboard/monthly-income?from&to — confirmed monthly income for the trend chart (§57.8)
- GET /api/v1/investments/holdings — holdings + per-account cash/holdings/total (§54)
- POST /api/v1/investments/holdings — add a holding (invest accounts only)
- PUT /api/v1/investments/holdings/{id} · DELETE /api/v1/investments/holdings/{id} — update/remove
- GET /api/v1/assets/bank/banks — supported no-login banks (NH·KB·WR·IBK, §61)
- GET /api/v1/assets/bank-links — linked accounts (account number masked)
- PUT /api/v1/assets/accounts/{id}/bank-link — link + first balance query (§61)
- DELETE /api/v1/assets/accounts/{id}/bank-link — unlink (balance stays)
- POST /api/v1/assets/accounts/{id}/bank-sync — refresh balance (password + birth date re-entered)

Bank balance refresh (§61) calls the free quick-inquiry API at `api.bankapi.co.kr`.
It needs `BANK_API_KEY`, `BANK_SECRET_KEY` (from an email signup) and a fixed
`BANK_LINK_KEY` (falls back to `JWT_SECRET`) to encrypt stored account numbers.
Only Korean source IPs are accepted by that API, and the bank account must have
the bank's 빠른조회/간편조회 service enabled. Account passwords and birth dates are
never stored; only the account number is kept, encrypted.

Protected endpoints require `Authorization: Bearer <token>`; failures use the
`{code, message, details, timestamp}` format (401 AUTH_REQUIRED / 400 INVALID_REQUEST).
Real JWT validation follows in the FE-BE integration issue.

## Run and verify

Build tool is fixed to **Gradle** (§1 allows Gradle or Maven, one team standard only).

Current status:

- `build.gradle` and `settings.gradle` are present (Spring Boot 3.3.5, Java 21, MyBatis, PostgreSQL).
- Spring Boot main class: `src/main/java/com/assetflow/AssetflowApplication.java`.
- Gradle wrapper (8.10) is present and committed — no local Gradle install is needed.
- Data model draft: `db/schema.sql` (design notes in §37 of `.ai/project.md`).

Prerequisites: JDK 21 only (`JAVA_HOME` pointed at a JDK 21). The wrapper fetches Gradle itself. On the dev machine `JAVA_HOME` is set permanently as a **User env var** (Temurin 21 at `C:/Users/H/tools/jdk-21.0.12.1+1`), so new terminals need no setup — already-open shells must be reopened to pick it up.

```bash
./gradlew compileJava                  # fastest signal that the build is wired correctly
./gradlew test
./gradlew bootRun                      # boots without DB; DataSource/JPA/MyBatis autoconfig excluded
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"user@example.com","password":"password123"}'
```

Verification status: **verified on 2026-10-17** — `compileJava test` (3 tests pass) and
`bootRun` + login smoke (HTTP 200) on the dev machine. The machine has no system JDK/Gradle,
so Temurin 21 was provisioned at `C:/Users/H/tools/jdk-21.0.12.1+1` and registered as a
permanent User env `JAVA_HOME` (details in `.ai/project.md` §37.6).

Notes for AI collaboration:

- Keep API contract checks tied to test commands before PR.

---
- Prefer one build tool only (Maven or Gradle) to avoid ambiguity.
