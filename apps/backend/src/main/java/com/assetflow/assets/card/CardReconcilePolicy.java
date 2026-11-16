package com.assetflow.assets.card;

import com.assetflow.assets.CardImportLedger.ImportedRow;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

/**
 * CARD-MERGE-2: CSV 행이 이메일/미상 잔재를 지워도 되는지 판단하는 공용 정책.
 *
 * <p>업로드가 <b>명세서 수준</b>일 때만 그 기간의 잔재를 정리한다. 부분 업로드
 * (예: 3일치 3행)로도 기간 안의 이메일 행이 지워지면, CSV 가 덮지 않은 나머지
 * 기간의 사용자 데이터가 사라진다. 그래서 행 수와 기간을 함께 본다.</p>
 *
 * <p>업로드 API({@code CardImportController})와 드롭 폴더 임포터
 * ({@code CardDropFolderImporter})가 같은 임계값을 쓰도록 여기에 모은다 —
 * 한쪽만 고쳐지면 두 경로의 정리 범위가 어긋난다.</p>
 */
public final class CardReconcilePolicy {

    /** 명세서 수준으로 보는 최소 행 수. */
    public static final int MIN_ROWS = 10;

    /** 명세서 수준으로 보는 최소 기간(양끝 포함 일수). */
    public static final int MIN_SPAN_DAYS_INCLUSIVE = 20;

    private CardReconcilePolicy() {
    }

    /**
     * 행들이 덮는 날짜 범위(양끝 포함).
     *
     * @param rowCount          범위 계산에 쓰인(날짜가 있는) 행 수
     * @param spanDaysInclusive fromDate~toDate 일수 — 같은 날이면 1
     */
    public record CoveredRange(String fromDate, String toDate, int rowCount, int spanDaysInclusive) {

        /** 이 범위를 명세서 수준 업로드로 봐도 되는가. */
        public boolean isStatementSized() {
            return rowCount >= MIN_ROWS && spanDaysInclusive >= MIN_SPAN_DAYS_INCLUSIVE;
        }
    }

    /** 날짜가 있는 행의 최소~최대 범위. 날짜를 읽을 수 없으면 empty(정리하지 않는다). */
    public static Optional<CoveredRange> range(List<ImportedRow> rows) {
        if (rows == null || rows.isEmpty()) {
            return Optional.empty();
        }
        String min = null;
        String max = null;
        int dated = 0;
        for (ImportedRow row : rows) {
            String at = row.approvedAt();
            if (at == null || at.isBlank()) {
                continue;
            }
            dated++;
            if (min == null || at.compareTo(min) < 0) {
                min = at;
            }
            if (max == null || at.compareTo(max) > 0) {
                max = at;
            }
        }
        if (min == null) {
            return Optional.empty();
        }
        int span;
        try {
            span = (int) ChronoUnit.DAYS.between(LocalDate.parse(min), LocalDate.parse(max)) + 1;
        } catch (DateTimeParseException e) {
            // 날짜 형식이 깨졌으면 얼마나 덮는지 알 수 없다 — 지우지 않는 쪽으로 실패한다.
            return Optional.empty();
        }
        return Optional.of(new CoveredRange(min, max, dated, span));
    }

    /** 업로드 행들이 명세서 수준인가(행 수 ≥ 10 그리고 기간 ≥ 20일). */
    public static boolean isStatementSized(List<ImportedRow> rows) {
        return range(rows).map(CoveredRange::isStatementSized).orElse(false);
    }
}
