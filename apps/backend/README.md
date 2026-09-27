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

Current status:

- This folder currently contains source files only.
- Build tool files like `pom.xml` or `build.gradle` are not present yet.

When backend scaffolding is added, use one of the following:

Maven (if `pom.xml` is used):

```bash
./mvnw spring-boot:run
./mvnw test
```

Gradle (if `build.gradle` is used):

```bash
./gradlew bootRun
./gradlew test
```

Notes for AI collaboration:

- Keep API contract checks tied to test commands before PR.
- Prefer one build tool only (Maven or Gradle) to avoid ambiguity.
