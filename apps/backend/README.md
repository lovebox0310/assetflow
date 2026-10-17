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
