package com.assetflow.assets;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link PostgresCardImportLedger} 의 병합·정리 SQL 을 <b>실제 PostgreSQL</b> 로 검증한다.
 *
 * <p>인메모리 구현만 테스트되던 영역이라, DB 방언(ON CONFLICT·COALESCE·OFFSET·DATE 비교)이
 * 틀려도 알 수 없었다. 여기서는 {@link PostgresTestCluster} 가 띄운 일회용 클러스터에
 * {@code apps/backend/db/schema.sql} 을 그대로 적용하고, 실제 SQL 을 실행한다.</p>
 *
 * <p>PostgreSQL 바이너리가 없는 환경에서는 <b>skip</b> 된다(실패 아님).</p>
 */
class PostgresCardImportLedgerTest {

    private static final String OWNER_EMAIL = "postgres-ledger-test@example.com";
    private static final long OWNER_ID = 1L;

    private static PostgresTestCluster cluster;
    private static JdbcTemplate jdbc;
    private static CardImportLedger ledger;

    @BeforeAll
    static void startCluster() throws Exception {
        Optional<Path> binDir = PostgresTestCluster.findBinDir();
        Assumptions.assumeTrue(binDir.isPresent(),
                "PostgreSQL 바이너리가 없어 실 DB 통합 테스트를 건너뜁니다 "
                        + "(PG_BIN 환경변수 또는 /usr/lib/postgresql/*/bin 필요)");

        cluster = PostgresTestCluster.start(binDir.get());
        cluster.applySchema(schemaFile());

        jdbc = new JdbcTemplate(cluster.dataSource());
        // users.id 는 GENERATED ALWAYS — 명시 값을 넣으려면 OVERRIDING SYSTEM VALUE 가 필요하다.
        jdbc.update("INSERT INTO users (id, email, password_hash) OVERRIDING SYSTEM VALUE VALUES (?, ?, ?)",
                OWNER_ID, OWNER_EMAIL, "test-only");
        jdbc.update("INSERT INTO asset_accounts (user_id, account_type, name) VALUES (?, 'invest', ?)",
                OWNER_ID, "테스트 증권 계좌");

        ledger = new PostgresCardImportLedger(jdbc, OWNER_EMAIL);
    }

    @AfterAll
    static void stopCluster() {
        if (cluster != null) {
            cluster.close();
            cluster = null;
        }
    }

    @BeforeEach
    void clearCardImports() {
        // 테스트 간 격리 — 사용자/계좌 행은 @BeforeAll 에서 만든 것을 유지한다.
        jdbc.update("TRUNCATE TABLE card_imports RESTART IDENTITY");
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

    private static CardImportLedger.ImportedRow row(String rowKey, String approvedAt, String merchant,
                                                    long supply, long vat, long gross,
                                                    String cardMasked, String kind, String subCategory,
                                                    String businessNo, String businessCategory,
                                                    String cardCompany, String source) {
        return new CardImportLedger.ImportedRow(
                rowKey, approvedAt, merchant, supply, vat, gross,
                cardMasked, kind, subCategory, businessNo, businessCategory,
                "본인", cardCompany, source);
    }

    /** CARD-MERGE-1 2번 규칙: email 행이 있으면 같은 자연키의 csv 행이 1행으로 대체한다. */
    @Test
    void emailRowIsReplacedByCsvRow() {
        ledger.addAll(List.of(row("email|1", "2026-10-06", "합성마트 합성지점", 555940, 0, 555940,
                "본인 카드", "식비", "장보기", "", "", "현대카드", CardImportLedger.SOURCE_EMAIL)));

        int stored = ledger.addAll(List.of(row("csv|1", "2026-10-06", "(주)합성마트 - 합성지점",
                505400, 50540, 555940,
                "****1111", "", "", "1234567890", "마트", "현대카드", CardImportLedger.SOURCE_CSV)));

        assertThat(stored).isEqualTo(1);
        List<CardImportLedger.ImportedRow> rows = ledger.all();
        assertThat(rows).hasSize(1);
        CardImportLedger.ImportedRow merged = rows.get(0);
        assertThat(merged.rowKey()).isEqualTo("csv|1");                 // 승인번호(row_key)도 CSV 값
        assertThat(merged.merchantName()).isEqualTo("(주)합성마트 - 합성지점");
        assertThat(merged.supplyExVat()).isEqualTo(505400);
        assertThat(merged.vat()).isEqualTo(50540);
        assertThat(merged.grossAmount()).isEqualTo(555940);
        assertThat(merged.cardMasked()).isEqualTo("****1111");
        assertThat(merged.businessNo()).isEqualTo("1234567890");
        assertThat(merged.businessCategory()).isEqualTo("마트");
        assertThat(merged.source()).isEqualTo(CardImportLedger.SOURCE_CSV);
        // 사용자가 붙인 분류는 CSV 에 분류가 없으므로 유지된다.
        assertThat(merged.expenseKind()).isEqualTo("식비");
        assertThat(merged.subCategory()).isEqualTo("장보기");
    }

    /** CARD-MERGE-1 3번 규칙: csv 정본은 뒤늦은 email 행에 덮이지 않는다. */
    @Test
    void csvRowIsNotOverwrittenByEmailRow() {
        ledger.addAll(List.of(row("csv|1", "2026-10-06", "(주)합성마트 - 합성지점", 505400, 50540, 555940,
                "****1111", "", "", "1234567890", "마트", "현대카드", CardImportLedger.SOURCE_CSV)));

        int stored = ledger.addAll(List.of(row("email|1", "2026-10-06", "합성마트 합성지점", 555940, 0, 555940,
                "본인 카드", "식비", "장보기", "", "", "현대카드", CardImportLedger.SOURCE_EMAIL)));

        assertThat(stored).isZero();
        List<CardImportLedger.ImportedRow> rows = ledger.all();
        assertThat(rows).hasSize(1);
        CardImportLedger.ImportedRow kept = rows.get(0);
        assertThat(kept.rowKey()).isEqualTo("csv|1");
        assertThat(kept.merchantName()).isEqualTo("(주)합성마트 - 합성지점");
        assertThat(kept.vat()).isEqualTo(50540);
        assertThat(kept.cardMasked()).isEqualTo("****1111");
        assertThat(kept.source()).isEqualTo(CardImportLedger.SOURCE_CSV);
        assertThat(kept.expenseKind()).isEmpty();
    }

    /** 자연키에서 가맹점명을 뺐어도, 같은 날 같은 금액의 다른 가맹점 2건은 순번으로 보존한다. */
    @Test
    void sameDaySameAmountDifferentMerchantsAreBothKept() {
        int stored = ledger.addAll(List.of(
                row("csv|1", "2026-10-07", "스타벅스 강남점", 5000, 0, 5000,
                        "****1111", "", "", "", "", "현대카드", CardImportLedger.SOURCE_CSV),
                row("csv|2", "2026-10-07", "이마트 역삼점", 5000, 0, 5000,
                        "****1111", "", "", "", "", "현대카드", CardImportLedger.SOURCE_CSV)));

        assertThat(stored).isEqualTo(2);
        List<CardImportLedger.ImportedRow> rows = ledger.all();
        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(CardImportLedger.ImportedRow::rowKey)
                .containsExactly("csv|1", "csv|2");
        assertThat(rows).extracting(CardImportLedger.ImportedRow::merchantName)
                .containsExactly("스타벅스 강남점", "이마트 역삼점");
    }

    /** CARD-MERGE-2: 같은 카드사·기간의 email/unknown 만 지운다(csv·다른 카드사·기간 밖 보존). */
    @Test
    void deleteUnconfirmedInRangeRemovesOnlyEmailAndUnknownInRange() {
        ledger.addAll(List.of(
                // 보존: CSV 정본 (같은 카드사·기간)
                row("csv|keep", "2026-10-06", "합성마트", 10900, 1100, 12000,
                        "****1111", "", "", "", "", "현대카드", CardImportLedger.SOURCE_CSV),
                // 삭제: 같은 카드사·기간의 email
                row("email|1", "2026-10-07", "합성마트", 20000, 0, 20000,
                        "본인 카드", "", "", "", "", "현대카드", CardImportLedger.SOURCE_EMAIL),
                // 삭제: 같은 카드사·기간의 unknown(출처 미상 레거시)
                row("legacy|1", "2026-10-08", "합성마트", 3000, 0, 3000,
                        "****1111", "", "", "", "", "현대카드", CardImportLedger.SOURCE_UNKNOWN),
                // 보존: 다른 카드사
                row("email|samsung", "2026-10-07", "합성마트", 21000, 0, 21000,
                        "본인 카드", "", "", "", "", "삼성카드", CardImportLedger.SOURCE_EMAIL),
                // 보존: 기간 밖
                row("email|sep", "2026-09-30", "합성마트", 22000, 0, 22000,
                        "본인 카드", "", "", "", "", "현대카드", CardImportLedger.SOURCE_EMAIL)));
        assertThat(ledger.all()).hasSize(5);

        int deleted = ledger.deleteUnconfirmedInRange("현대카드", "2026-10-01", "2026-10-31");

        assertThat(deleted).isEqualTo(2);
        List<CardImportLedger.ImportedRow> rows = ledger.all();
        assertThat(rows).extracting(CardImportLedger.ImportedRow::rowKey)
                .containsExactly("csv|keep", "email|samsung", "email|sep");
    }

    /** 기존 메서드(backfillCardCompany)가 스키마·방언과 맞는지 1건 확인한다. */
    @Test
    void backfillCardCompanyFillsBlankCompanyFromSameMaskedCard() {
        ledger.addAll(List.of(
                row("csv|known", "2026-10-11", "합성마트", 12000, 0, 12000,
                        "****1111", "", "", "", "", "현대카드", CardImportLedger.SOURCE_CSV),
                row("csv|blank", "2026-10-12", "합성마트", 12000, 0, 12000,
                        "****1111", "", "", "", "", null, CardImportLedger.SOURCE_UNKNOWN)));
        assertThat(ledger.find("csv|blank").orElseThrow().cardCompany()).isEmpty();

        int updated = ledger.backfillCardCompany();

        assertThat(updated).isEqualTo(1);
        assertThat(ledger.find("csv|blank").orElseThrow().cardCompany()).isEqualTo("현대카드");
        // 이미 값이 있는 행은 그대로다.
        assertThat(ledger.find("csv|known").orElseThrow().cardCompany()).isEqualTo("현대카드");
    }
}
