# backend workspace

Backend implementation area for AssetFlow.

## Planned stack

- Java
- Spring Boot
- PostgreSQL

## Sprint 1 target APIs

- GET /api/v1/me
- GET /api/v1/dashboard/summary
- GET /api/v1/dashboard/cashflow?months=3

## Run and verify

Build tool is fixed to **Gradle** (§1 allows Gradle or Maven, one team standard only).

Current status:

- `build.gradle` and `settings.gradle` are present (Spring Boot 3.3.5, Java 21, MyBatis, PostgreSQL).
- **Not yet present:** the Gradle wrapper (`gradlew`, `gradle/wrapper/*`) and a Spring Boot
  main class (`@SpringBootApplication`). Until the main class exists the app cannot boot,
  so `bootRun` will fail even with a correct JDK installed.

Prerequisites: JDK 21 and Gradle 8.5+. On a machine that has them:

```bash
gradle wrapper --gradle-version 8.10   # once, then commit the wrapper files
./gradlew compileJava                  # fastest signal that the build is wired correctly
./gradlew test
./gradlew bootRun                      # needs the main class first
```

Verification status: **unverified.** The development machine used on 2026-10-17 had no
JDK, no Gradle and no Docker (`where java`/`gradle`/`docker` all miss, `JAVA_HOME` unset),
so nothing above was actually executed. Treat these as the commands to run, not as passing results.

Notes for AI collaboration:

- Keep API contract checks tied to test commands before PR.
- Prefer one build tool only (Maven or Gradle) to avoid ambiguity.
