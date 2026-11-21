package com.assetflow.investments.toss;

import com.assetflow.assets.PostgresTestCluster;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link PostgresTossCredentialsLedger} 를 <b>실제 PostgreSQL</b> 로 검증한다 (이슈 #55).
 *
 * <p>{@link PostgresTestCluster} 가 띄운 일회용 클러스터에 {@code db/schema.sql} 을 그대로
 * 적용하고, 계좌별 1행(ON CONFLICT), account_id NULL 행 1개 유지, 삭제 SQL 을 실행한다.
 * 토스 DDL 은 같은 파일에서 다시 뽑아 한 번 더 적용해 멱등(2회 적용)도 확인한다.</p>
 *
 * <p>PostgreSQL 바이너리가 없는 환경에서는 <b>skip</b> 된다(실패 아님).</p>
 */
class PostgresTossCredentialsLedgerTest {

    private static final String OWNER_EMAIL = "postgres-toss-test@example.com";
    private static final long OWNER_ID = 1L;

    private static PostgresTestCluster cluster;
    private static JdbcTemplate jdbc;
    private static PostgresTossCredentialsLedger ledger;
    private static long accountId;

    @BeforeAll
    static void startCluster() throws Exception {
        Optional<Path> binDir = PostgresTestCluster.findBinDir();
        Assumptions.assumeTrue(binDir.isPresent(),
                "PostgreSQL 바이너리가 없어 실 DB 통합 테스트를 건너뜁니다 "
                        + "(PG_BIN 환경변수 또는 /usr/lib/postgresql/*/bin 필요)");

        Path schema = schemaFile();
        cluster = PostgresTestCluster.start(binDir.get());
        cluster.applySchema(schema);

        jdbc = new JdbcTemplate(cluster.dataSource());
        // schema.sql 전체를 두 번 적용할 수는 없다(CREATE TABLE users 등은 IF NOT EXISTS 가
        // 아니다 — 운영은 continue-on-error 로 넘긴다). 이번에 추가한 토스 DDL 만 같은
        // 파일에서 다시 뽑아 한 번 더 실행해 멱등을 확인한다.
        applyTossStatementsTwice(schema);

        // users.id 는 GENERATED ALWAYS — 명시 값을 넣으려면 OVERRIDING SYSTEM VALUE 가 필요하다.
        jdbc.update("INSERT INTO users (id, email, password_hash) OVERRIDING SYSTEM VALUE VALUES (?, ?, ?)",
                OWNER_ID, OWNER_EMAIL, "test-only");
        accountId = jdbc.queryForObject(
                "INSERT INTO asset_accounts (user_id, account_type, name) VALUES (?, 'invest', ?) RETURNING id",
                Long.class, OWNER_ID, "토스 테스트 계좌");

        ledger = new PostgresTossCredentialsLedger(jdbc);
    }

    @AfterAll
    static void stopCluster() {
        if (cluster != null) {
            cluster.close();
            cluster = null;
        }
    }

    @BeforeEach
    void clearCredentials() {
        jdbc.update("TRUNCATE TABLE toss_credentials RESTART IDENTITY");
    }

    @Test
    void 계좌별_한행을_유지하고_계좌가_없어도_한행만_남긴다() {
        ledger.save(OWNER_ID, new TossCredentials(accountId, "enc-id", "enc-secret", "seq-1"));

        TossCredentials found = ledger.findByUserId(OWNER_ID).orElseThrow();
        assertThat(found.accountId()).isEqualTo(accountId);
        assertThat(found.clientId()).isEqualTo("enc-id");
        assertThat(found.clientSecret()).isEqualTo("enc-secret");
        assertThat(found.tossAccountSeq()).isEqualTo("seq-1");

        // 같은 계좌로 다시 저장하면 행이 늘지 않고 값이 바뀐다(ON CONFLICT).
        ledger.save(OWNER_ID, new TossCredentials(accountId, "enc-id-2", "enc-secret-2", null));
        assertThat(rowCount()).isEqualTo(1);
        assertThat(ledger.findByUserId(OWNER_ID).orElseThrow().clientSecret()).isEqualTo("enc-secret-2");

        // 계좌 미지정 저장은 NULL 행 1개를 유지한다(반복 저장해도 늘지 않는다).
        ledger.save(OWNER_ID, new TossCredentials(null, "enc-a", "enc-b", null));
        ledger.save(OWNER_ID, new TossCredentials(null, "enc-a-2", "enc-b-2", "seq-2"));
        assertThat(rowCount("account_id IS NULL")).isEqualTo(1);

        // 조회는 계좌가 지정된 행을 먼저 돌려준다(화면 상태 표시용).
        assertThat(ledger.findByUserId(OWNER_ID).orElseThrow().accountId()).isEqualTo(accountId);

        // 삭제는 사용자의 모든 행을 지운다.
        ledger.delete(OWNER_ID);
        assertThat(ledger.findByUserId(OWNER_ID)).isEmpty();
        assertThat(rowCount()).isZero();
    }

    private static int rowCount() {
        return rowCount("TRUE");
    }

    private static int rowCount(String condition) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM toss_credentials WHERE " + condition, Integer.class);
        return count == null ? 0 : count;
    }

    /** schema.sql 에서 toss_credentials 를 다루는 문장만 뽑아 두 번 실행한다(멱등 확인). */
    private static void applyTossStatementsTwice(Path schema) {
        List<String> statements = tossStatements(schema);
        assertThat(statements).as("토스 DDL 이 schema.sql 에 있다").isNotEmpty();
        for (int round = 0; round < 2; round++) {
            for (String sql : statements) {
                jdbc.execute(sql);
            }
        }
    }

    private static List<String> tossStatements(Path schema) {
        String sql;
        try {
            sql = Files.readString(schema, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("schema.sql 을 읽지 못했습니다: " + schema, e);
        }
        List<String> withoutComments = new ArrayList<>();
        for (String line : sql.split("\n")) {
            int comment = line.indexOf("--");
            withoutComments.add(comment >= 0 ? line.substring(0, comment) : line);
        }
        List<String> result = new ArrayList<>();
        for (String chunk : String.join("\n", withoutComments).split(";")) {
            String normalized = chunk.replaceAll("\\s+", " ").trim();
            if (normalized.contains("toss_credentials")) {
                result.add(normalized);
            }
        }
        return result;
    }

    private static Path schemaFile() {
        for (Path candidate : List.of(Path.of("db/schema.sql"), Path.of("apps/backend/db/schema.sql"))) {
            Path absolute = candidate.toAbsolutePath().normalize();
            if (Files.isRegularFile(absolute)) {
                return absolute;
            }
        }
        throw new IllegalStateException("db/schema.sql 을 찾지 못했습니다 (작업 디렉터리: "
                + Path.of("").toAbsolutePath() + ")");
    }
}
