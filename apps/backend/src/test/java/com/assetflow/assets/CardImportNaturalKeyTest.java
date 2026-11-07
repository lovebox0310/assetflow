package com.assetflow.assets;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * §71 회귀: 카드 명세서 출처가 달라도(수동 업로드 ↔ 이메일) 같은 거래는
 * row_key 형식이 달라 중복 저장됐다. 자연키(카드사·승인일·금액·정규화 가맹점명)로
 * 중복을 막는다.
 */
class CardImportNaturalKeyTest {

    private static CardImportLedger.ImportedRow row(String rowKey, String date, String merchant,
                                                    long gross, String company) {
        return new CardImportLedger.ImportedRow(
                rowKey, date, merchant, gross, 0, gross,
                "****", null, null, null, null, "본인", company);
    }

    @Test
    void emailRowMatchingUploadRowIsNotStoredAgain() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
        // 수동 업로드(CSV/XLSX)에서 들어온 행
        ledger.addAll(List.of(row("2026-10-06|삼성화재다이렉트자동차앱카드|555940|0|3614|매입|0#1",
                "2026-10-06", "삼성화재다이렉트자동차앱카드", 555940, "현대카드")));

        // 이메일 명세서에서 들어온 같은 거래 — row_key 형식만 다르다.
        int stored = ledger.addAll(List.of(row("1|2026-10-06|삼성화재다이렉트자동차앱카드|555940|본인 MY BUSINESS M",
                "2026-10-06", "삼성화재다이렉트자동차앱카드", 555940, "현대카드")));

        assertThat(stored).isZero();
        assertThat(ledger.all()).hasSize(1);
    }

    @Test
    void merchantSpacingDifferenceIsTreatedAsSameTransaction() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
        ledger.addAll(List.of(row("a", "2026-10-04", "태경산업 (주) 문막제2영업소", 5300, "삼성카드")));

        int stored = ledger.addAll(List.of(row("b", "2026-10-04", "태경산업(주)문막제2영업소", 5300, "삼성카드")));

        assertThat(stored).isZero();
        assertThat(ledger.all()).hasSize(1);
    }

    @Test
    void differentDateOrCompanyIsNotCollapsed() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
        ledger.addAll(List.of(row("a", "2026-10-04", "가맹점", 5000, "현대카드")));

        int stored = ledger.addAll(List.of(
                row("b", "2026-10-05", "가맹점", 5000, "현대카드"),
                row("c", "2026-10-04", "가맹점", 5000, "삼성카드")));

        assertThat(stored).isEqualTo(2);
        assertThat(ledger.all()).hasSize(3);
    }

    @Test
    void repeatedSameDayPurchaseBeyondExistingCountIsKept() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
        ledger.addAll(List.of(row("a", "2026-10-09", "라임가든", 18500, "현대카드")));

        // 같은 날 같은 가맹점·금액이 실제로 두 번 있었던 경우 — 한 건만 더 저장한다.
        int stored = ledger.addAll(List.of(
                row("b", "2026-10-09", "라임가든", 18500, "현대카드"),
                row("c", "2026-10-09", "라임가든", 18500, "현대카드")));

        assertThat(stored).isEqualTo(1);
        assertThat(ledger.all()).hasSize(2);
    }
}
