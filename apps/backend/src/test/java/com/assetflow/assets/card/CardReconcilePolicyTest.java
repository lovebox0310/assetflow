package com.assetflow.assets.card;

import com.assetflow.assets.CardImportLedger.ImportedRow;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CARD-MERGE-2 임계값(행 수·기간) 경계. 업로드 API 와 드롭 폴더 임포터가 같은 정책을 쓴다.
 */
class CardReconcilePolicyTest {

    private static ImportedRow row(String approvedAt) {
        return new ImportedRow("csv|" + approvedAt, approvedAt, "합성문구", 10000, 1000, 11000,
                "****1111", "", "", "", "", "본인", "현대카드", "csv");
    }

    /** start 부터 stepDays 간격으로 count 행. */
    private static List<ImportedRow> rows(String start, int count, int stepDays) {
        List<ImportedRow> rows = new ArrayList<>();
        LocalDate date = LocalDate.parse(start);
        for (int i = 0; i < count; i++) {
            rows.add(row(date.plusDays((long) i * stepDays).toString()));
        }
        return rows;
    }

    @Test
    void nineRowsAreNotStatementSized() {
        assertThat(CardReconcilePolicy.isStatementSized(rows("2026-10-01", 9, 3))).isFalse();
    }

    @Test
    void tenRowsOverNineteenDaysAreNotStatementSized() {
        // 10/01~10/19 = 19일(양끝 포함) — 기준 20일에 하루 모자란다.
        List<ImportedRow> rows = rows("2026-10-01", 10, 2);
        assertThat(rows.get(rows.size() - 1).approvedAt()).isEqualTo("2026-10-19");
        assertThat(CardReconcilePolicy.isStatementSized(rows)).isFalse();
    }

    @Test
    void tenRowsOverTwentyDaysAreStatementSized() {
        // 10/01~10/20 = 20일(양끝 포함).
        List<ImportedRow> rows = rows("2026-10-01", 10, 2);
        rows.set(rows.size() - 1, row("2026-10-20"));
        assertThat(CardReconcilePolicy.isStatementSized(rows)).isTrue();
    }

    @Test
    void emptyOrUndatedRowsAreNotStatementSized() {
        assertThat(CardReconcilePolicy.isStatementSized(List.of())).isFalse();
        assertThat(CardReconcilePolicy.range(List.of())).isEmpty();
        assertThat(CardReconcilePolicy.isStatementSized(List.of(row(" ")))).isFalse();
    }
}
