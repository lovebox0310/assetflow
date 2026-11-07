package com.assetflow.assets;

import java.util.List;

/**
 * 카드 명세서 요약 원장 (§72).
 *
 * <p>월별 카드 금액을 승인일 합계가 아니라 명세서의 이용기간 총액으로 표시하기 위해
 * 명세서 기간·총액을 보관한다. `kind='billing'` 만 월 금액에 사용하고,
 * `detail` 은 기간을 지정해 요청한 상세내역서다.</p>
 */
public interface CardStatementLedger {

    /**
     * @param usageMonth 이용기간 시작 월(YYYY-MM) — 월 버킷 키
     */
    record StatementRow(long id, String cardCompany, String kind, String usageMonth,
                        String periodStart, String periodEnd, long totalAmount) {}

    /** usage_month 가 from~to(YYYY-MM, 양끝 포함) 인 명세서 요약. */
    List<StatementRow> inRange(String fromMonth, String toMonth);

    /** (카드사, 이용기간)이 같으면 총액을 갱신한다. */
    void upsert(StatementRow row);
}
