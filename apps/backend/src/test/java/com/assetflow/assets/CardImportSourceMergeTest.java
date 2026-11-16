package com.assetflow.assets;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CARD-MERGE-1: 카드내역을 (카드사·이용일·금액) 으로 통합하고 CSV 를 정본으로 삼는다.
 *
 * <p>이메일 명세서와 CSV 업로드는 포맷이 달라 같은 이용내역이 중복 저장됐다.
 * 자연키에서 가맹점명을 빼고, 같은 자리에 이미 행이 있으면 출처에 따라
 * 대체(csv)하거나 무시(email)한다. 값이 실제로 바뀌는지는 저장 결과로 확인한다.</p>
 */
class CardImportSourceMergeTest {

    private static CardImportLedger.ImportedRow row(String rowKey, String approvedAt, String merchant,
                                                    long supply, long vat, long gross,
                                                    String cardMasked, String expenseKind, String subCategory,
                                                    String businessNo, String businessCategory, String source) {
        return row(rowKey, approvedAt, merchant, supply, vat, gross,
                cardMasked, expenseKind, subCategory, businessNo, businessCategory, "본인", source);
    }

    private static CardImportLedger.ImportedRow row(String rowKey, String approvedAt, String merchant,
                                                    long supply, long vat, long gross,
                                                    String cardMasked, String expenseKind, String subCategory,
                                                    String businessNo, String businessCategory,
                                                    String memberRelation, String source) {
        return new CardImportLedger.ImportedRow(
                rowKey, approvedAt, merchant, supply, vat, gross,
                cardMasked, expenseKind, subCategory, businessNo, businessCategory,
                memberRelation, "현대카드", source);
    }

    @Test
    void emailRowIsReplacedByCsvRow() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
        // 이메일 명세서가 먼저 들어온 같은 거래 — 사용자가 분류를 붙여 둔 상태
        ledger.addAll(List.of(row("email|1", "2026-10-06", "합성마트 합성지점", 500000, 55940, 555940,
                "****3333", "식비", "장보기", "", "", CardImportLedger.SOURCE_EMAIL)));

        int stored = ledger.addAll(List.of(row("csv|1", "2026-10-06", "합성마트 - 합성지점", 505400, 50540, 555940,
                "****1111", "", "", "1234567890", "마트", CardImportLedger.SOURCE_CSV)));

        assertThat(stored).isEqualTo(1);
        assertThat(ledger.all()).hasSize(1);
        CardImportLedger.ImportedRow merged = ledger.all().get(0);
        // 승인번호(row_key)·가맹점명·부가세·공급가·카드번호·사업자번호·업종·출처는 CSV 값
        assertThat(merged.rowKey()).isEqualTo("csv|1");
        assertThat(merged.merchantName()).isEqualTo("합성마트 - 합성지점");
        assertThat(merged.supplyExVat()).isEqualTo(505400);
        assertThat(merged.vat()).isEqualTo(50540);
        assertThat(merged.cardMasked()).isEqualTo("****1111");
        assertThat(merged.businessNo()).isEqualTo("1234567890");
        assertThat(merged.businessCategory()).isEqualTo("마트");
        assertThat(merged.source()).isEqualTo(CardImportLedger.SOURCE_CSV);
        // 사용자가 붙인 분류는 유지된다 (CSV 에 분류가 없으므로)
        assertThat(merged.expenseKind()).isEqualTo("식비");
        assertThat(merged.subCategory()).isEqualTo("장보기");
    }

    @Test
    void csvRowIsNotOverwrittenByEmailRow() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
        ledger.addAll(List.of(row("csv|1", "2026-10-06", "합성마트 - 합성지점", 505400, 50540, 555940,
                "****1111", "", "", "1234567890", "마트", CardImportLedger.SOURCE_CSV)));

        // 나중에 이메일 수집이 같은 거래를 다시 가져온다
        int stored = ledger.addAll(List.of(row("email|1", "2026-10-06", "합성마트 합성지점", 500000, 55940, 555940,
                "****3333", "식비", "장보기", "", "", CardImportLedger.SOURCE_EMAIL)));

        assertThat(stored).isZero();
        assertThat(ledger.all()).hasSize(1);
        CardImportLedger.ImportedRow kept = ledger.all().get(0);
        assertThat(kept.source()).isEqualTo(CardImportLedger.SOURCE_CSV);
        assertThat(kept.merchantName()).isEqualTo("합성마트 - 합성지점");
        assertThat(kept.vat()).isEqualTo(50540);
        assertThat(kept.expenseKind()).isEmpty();
    }

    @Test
    void sameDaySameAmountDifferentMerchantsAreBothKept() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();

        int stored = ledger.addAll(List.of(
                row("a", "2026-10-07", "스타벅스 강남점", 5000, 0, 5000,
                        "****1111", "", "", "", "", CardImportLedger.SOURCE_CSV),
                row("b", "2026-10-07", "이마트 역삼점", 5000, 0, 5000,
                        "****1111", "", "", "", "", CardImportLedger.SOURCE_CSV)));

        assertThat(stored).isEqualTo(2);
        assertThat(ledger.all()).hasSize(2);
        assertThat(ledger.all()).extracting(CardImportLedger.ImportedRow::merchantName)
                .containsExactly("스타벅스 강남점", "이마트 역삼점");
    }

    @Test
    void repeatedSameMerchantTwiceThenCsvKeepsTwoRows() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
        // 같은 날 같은 가맹점·금액이 실제로 두 번 (이메일)
        ledger.addAll(List.of(
                row("email|1#1", "2026-10-09", "라임가든", 18500, 0, 18500,
                        "****3333", "", "", "", "", CardImportLedger.SOURCE_EMAIL),
                row("email|1#2", "2026-10-09", "라임가든", 18500, 0, 18500,
                        "****3333", "", "", "", "", CardImportLedger.SOURCE_EMAIL)));
        assertThat(ledger.all()).hasSize(2);

        // CSV 두 건이 같은 두 거래를 대체한다 — 1건으로 합치지 않는다
        int stored = ledger.addAll(List.of(
                row("csv|1#1", "2026-10-09", "라임가든", 18500, 0, 18500,
                        "****1111", "", "", "1234567890", "음식점", CardImportLedger.SOURCE_CSV),
                row("csv|1#2", "2026-10-09", "라임가든", 18500, 0, 18500,
                        "****1111", "", "", "1234567890", "음식점", CardImportLedger.SOURCE_CSV)));

        assertThat(stored).isEqualTo(2);
        assertThat(ledger.all()).hasSize(2);
        assertThat(ledger.all()).allMatch(r -> CardImportLedger.SOURCE_CSV.equals(r.source()));
        assertThat(ledger.all()).extracting(CardImportLedger.ImportedRow::rowKey)
                .containsExactly("csv|1#1", "csv|1#2");
    }

    // --- 현대카드 실제 값 특성 ---
    // VestMail 이메일 행은 vat=0, supplyExVat=이용금액, cardMasked="본인 카드"/"가족 카드",
    // 승인번호 없음(row_key 는 userId|이용일|가맹점|금액|카드표기#n) 이다.
    // CSV 업로드 행만 부가세·실제 마스킹 카드번호·승인번호·사업자번호/업종을 가진다.

    /** AC1: 이메일(vat=0, 카드번호 없음) → CSV 대체 시 부가세·카드번호·승인번호가 CSV 값이 된다. */
    @Test
    void hyundaiEmailRowWithoutVatIsReplacedByCsvRow() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
        ledger.addAll(List.of(row("7|2026-10-06|합성마트 합성지점|555940|본인 카드#1",
                "2026-10-06", "합성마트 합성지점", 555940, 0, 555940,
                "본인 카드", "식비", "장보기", "", "", CardImportLedger.SOURCE_EMAIL)));

        int stored = ledger.addAll(List.of(row("csv|1", "2026-10-06", "(주)합성마트 - 합성지점",
                505400, 50540, 555940, "****1111", "", "", "1234567890", "마트",
                CardImportLedger.SOURCE_CSV)));

        assertThat(stored).isEqualTo(1);
        assertThat(ledger.all()).hasSize(1);
        CardImportLedger.ImportedRow merged = ledger.all().get(0);
        // 승인번호(row_key)·부가세·공급가·카드번호·사업자번호/업종이 CSV 값
        assertThat(merged.rowKey()).isEqualTo("csv|1");
        assertThat(merged.vat()).isEqualTo(50540);
        assertThat(merged.supplyExVat()).isEqualTo(505400);
        assertThat(merged.grossAmount()).isEqualTo(555940);
        assertThat(merged.cardMasked()).isEqualTo("****1111");
        assertThat(merged.businessNo()).isEqualTo("1234567890");
        assertThat(merged.businessCategory()).isEqualTo("마트");
        assertThat(merged.source()).isEqualTo(CardImportLedger.SOURCE_CSV);
        // 사용자가 붙인 분류는 유지된다
        assertThat(merged.expenseKind()).isEqualTo("식비");
        assertThat(merged.subCategory()).isEqualTo("장보기");
    }

    /** AC2: CSV 가 오기 전에는 이메일 값(vat=0, 카드표기)이 그대로 남는다. */
    @Test
    void hyundaiEmailOnlyRowKeepsZeroVatUntilCsvArrives() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();

        int stored = ledger.addAll(List.of(row("7|2026-10-06|합성마트 합성지점|555940|본인 카드#1",
                "2026-10-06", "합성마트 합성지점", 555940, 0, 555940,
                "본인 카드", "", "", "", "", CardImportLedger.SOURCE_EMAIL)));

        assertThat(stored).isEqualTo(1);
        assertThat(ledger.all()).hasSize(1);
        CardImportLedger.ImportedRow kept = ledger.all().get(0);
        assertThat(kept.vat()).isZero();
        assertThat(kept.supplyExVat()).isEqualTo(555940);
        assertThat(kept.grossAmount()).isEqualTo(555940);
        assertThat(kept.cardMasked()).isEqualTo("본인 카드");
        assertThat(kept.source()).isEqualTo(CardImportLedger.SOURCE_EMAIL);
        assertThat(kept.rowKey()).isEqualTo("7|2026-10-06|합성마트 합성지점|555940|본인 카드#1");
    }

    /** AC3: 같은 날·같은 금액이라도 본인/가족 카드 2건은 2건으로 유지되고 각각 CSV 로 대체된다. */
    @Test
    void hyundaiSameDaySameAmountTwoCardsAreBothKept() {
        InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
        // 실제 현대카드 이메일 행 — 카드표기가 달라 base row_key 가 다르고, 자연키는 같다.
        ledger.addAll(List.of(
                row("7|2026-10-12|합성마트 합성지점|12000|본인 카드#1", "2026-10-12", "합성마트 합성지점",
                        12000, 0, 12000, "본인 카드", "", "", "", "", "본인", CardImportLedger.SOURCE_EMAIL),
                row("7|2026-10-12|합성마트 합성지점|12000|가족 카드#1", "2026-10-12", "합성마트 합성지점",
                        12000, 0, 12000, "가족 카드", "", "", "", "", "가족", CardImportLedger.SOURCE_EMAIL)));
        // 같은 자연키(카드사·이용일·금액)여도 두 건을 합치지 않는다
        assertThat(ledger.all()).hasSize(2);

        // CSV 2건이 각각을 대체한다 (현대카드 CSV 는 '관계' 컬럼으로 본인/가족을 준다)
        int stored = ledger.addAll(List.of(
                row("csv|1", "2026-10-12", "(주)합성마트 - 합성지점", 10900, 1100, 12000,
                        "****1111", "", "", "1234567890", "마트", "본인", CardImportLedger.SOURCE_CSV),
                row("csv|2", "2026-10-12", "(주)합성마트 - 합성지점", 10900, 1100, 12000,
                        "****2222", "", "", "1234567890", "마트", "가족", CardImportLedger.SOURCE_CSV)));

        assertThat(stored).isEqualTo(2);
        assertThat(ledger.all()).hasSize(2);
        assertThat(ledger.all()).allMatch(r -> CardImportLedger.SOURCE_CSV.equals(r.source()));
        assertThat(ledger.all()).allMatch(r -> r.vat() == 1100 && r.supplyExVat() == 10900);
        assertThat(ledger.all()).extracting(CardImportLedger.ImportedRow::rowKey)
                .containsExactly("csv|1", "csv|2");
        assertThat(ledger.all()).extracting(CardImportLedger.ImportedRow::cardMasked)
                .containsExactly("****1111", "****2222");
        assertThat(ledger.all()).extracting(CardImportLedger.ImportedRow::memberRelation)
                .containsExactly("본인", "가족");
    }
}
