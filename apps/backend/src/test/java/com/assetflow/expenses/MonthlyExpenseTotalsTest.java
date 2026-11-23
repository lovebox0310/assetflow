package com.assetflow.expenses;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.CardStatementLedger;
import com.assetflow.assets.InMemoryCardImportLedger;
import com.assetflow.assets.InMemoryCardStatementLedger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이슈 #51 — 월 카드 금액은 명세서(billing) 합계, 없으면 승인일 합계 폴백.
 *
 * <p>픽스처는 2026-10 한 달만 쓴다. usage_month 는 이용기간 시작 월이라는 저장 규칙(§72)을
 * 그대로 따른다.</p>
 */
class MonthlyExpenseTotalsTest {

    private InMemoryCardImportLedger cardLedger;
    private InMemoryExpenseItemLedger itemLedger;
    private InMemoryCardStatementLedger statementLedger;
    private MonthlyExpenseTotals totals;

    @BeforeEach
    void setUp() {
        cardLedger = new InMemoryCardImportLedger();
        itemLedger = new InMemoryExpenseItemLedger();
        statementLedger = new InMemoryCardStatementLedger();
        totals = new MonthlyExpenseTotals(cardLedger, itemLedger, statementLedger);
    }

    /** 승인일 2026-10 행 하나(금액만 다르게). */
    private void approvalRow(String rowKey, String cardCompany, long gross) {
        approvalRowOn("2026-10-05", rowKey, cardCompany, gross);
    }

    /** 승인일을 지정한 카드내역 행 하나 — 월 버킷 경계를 확인할 때 쓴다. */
    private void approvalRowOn(String approvedAt, String rowKey, String cardCompany, long gross) {
        cardLedger.addAll(java.util.List.of(new CardImportLedger.ImportedRow(
                rowKey, approvedAt, "가맹점" + rowKey, gross, 0, gross,
                "", "", "", "", "", "", cardCompany)));
    }

    private void statement(String cardCompany, String kind, String usageMonth, long total) {
        statementLedger.upsert(new CardStatementLedger.StatementRow(
                0, cardCompany, kind, usageMonth, usageMonth + "-02", usageMonth + "-03", total));
    }

    @Test
    void usesBillingStatementTotalInsteadOfApprovalSum() {
        // 승인일 합계 4,000,000 — 명세서 청구액 3,800,000 (청구 주기 경계 때문에 다르다)
        approvalRow("a1", "현대카드", 2_500_000);
        approvalRow("a2", "현대카드", 1_500_000);
        statement("현대카드", "billing", "2026-10", 3_800_000);
        itemLedger.create("2026-10", "임대료", 1_000_000, true, 0, "교육");

        MonthlyExpenseTotals.Totals t = totals.compute("2026-10");

        assertThat(t.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_STATEMENT);
        assertThat(t.cardSpend()).isEqualTo(3_800_000);
        assertThat(t.cardStatementTotal()).isEqualTo(3_800_000);
        assertThat(t.statementCount()).isEqualTo(1);
        // 지출 = 명세서 카드 3,800,000 + 항목 1,000,000 (승인일 4,000,000 이 아니다)
        assertThat(t.expenses()).isEqualTo(4_800_000);
        assertThat(t.essential()).isEqualTo(1_000_000);
    }

    @Test
    void fallsBackToApprovalSumWhenNoStatement() {
        approvalRow("b1", "현대카드", 1_200_000);
        approvalRow("b2", "삼성카드", 800_000);
        itemLedger.create("2026-10", "기타", 300_000, false, 0, "교육");

        MonthlyExpenseTotals.Totals t = totals.compute("2026-10");

        assertThat(t.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_APPROVAL);
        assertThat(t.cardSpend()).isEqualTo(2_000_000);
        assertThat(t.cardStatementTotal()).isZero();
        assertThat(t.statementCount()).isZero();
        assertThat(t.expenses()).isEqualTo(2_300_000);
    }

    @Test
    void ignoresDetailStatements() {
        // detail(이용상세내역서)만 있으면 월 전체 청구액이 아니다 — 승인일 합계로 폴백한다.
        approvalRow("c1", "삼성카드", 900_000);
        statement("삼성카드", "detail", "2026-10", 400_000);

        MonthlyExpenseTotals.Totals t = totals.compute("2026-10");

        assertThat(t.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_APPROVAL);
        assertThat(t.cardSpend()).isEqualTo(900_000);
        assertThat(t.cardStatementTotal()).isZero();
        assertThat(t.statementCount()).isZero();
    }

    @Test
    void sumsBillingStatementsOfMultipleCardCompanies() {
        // 카드사별 청구서가 따로 온다 — 한 달 카드 금액은 두 장의 합이다.
        approvalRow("d1", "현대카드", 3_000_000);
        approvalRow("d2", "삼성카드", 1_000_000);
        statement("현대카드", "billing", "2026-10", 3_326_643);
        statement("삼성카드", "billing", "2026-10", 859_021);

        MonthlyExpenseTotals.Totals t = totals.compute("2026-10");

        assertThat(t.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_STATEMENT);
        assertThat(t.cardStatementTotal()).isEqualTo(4_185_664);
        assertThat(t.statementCount()).isEqualTo(2);
        assertThat(t.cardSpend()).isEqualTo(4_185_664);
        assertThat(t.expenses()).isEqualTo(4_185_664); // 항목 없음
        assertThat(t.essential()).isZero();
    }

    @Test
    void statementOfAnotherMonthDoesNotLeakIntoThisMonth() {
        // usage_month 는 이용기간 시작 월 — 2026-09 명세서(9/3~10/2)는 2026-09 버킷이다.
        approvalRow("e1", "삼성카드", 500_000);
        statement("삼성카드", "billing", "2026-09", 890_156);

        assertThat(totals.compute("2026-10").cardSource())
                .isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_APPROVAL);
        assertThat(totals.compute("2026-10").cardSpend()).isEqualTo(500_000);

        MonthlyExpenseTotals.Totals sep = totals.compute("2026-09");
        assertThat(sep.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_STATEMENT);
        assertThat(sep.cardSpend()).isEqualTo(890_156);
    }

    @Test
    void emptyMonthYieldsZeroWithoutStatement() {
        MonthlyExpenseTotals.Totals t = totals.compute("2026-10");

        assertThat(t.expenses()).isZero();
        assertThat(t.essential()).isZero();
        assertThat(t.cardSpend()).isZero();
        assertThat(t.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_APPROVAL);
        assertThat(t.statementCount()).isZero();
    }

    /*
     * 이슈 #56 — 판단은 카드사별이다. 2026-09 실측: 삼성은 명세서(890,156)가 있고
     * 현대는 명세서가 없어 승인일 합계(3,208,877)를 써야 한다. 종전 월 단위 판단은
     * 명세서가 하나라도 있으면 승인일 합계 전체를 버려 현대분이 통째로 사라졌다.
     * 항목 2,022,583 까지 더하면 지출 6,121,616 이다.
     */
    @Test
    void mixesStatementAndApprovalPerCardCompany() {
        approvalRowOn("2026-09-15", "m1", "현대카드", 3_000_000);
        approvalRowOn("2026-09-20", "m2", "현대카드", 208_877);
        approvalRowOn("2026-09-10", "m3", "삼성카드", 915_220);
        statement("삼성카드", "billing", "2026-09", 890_156);
        itemLedger.create("2026-09", "임대료", 2_022_583, true, 0, "교육");

        MonthlyExpenseTotals.Totals t = totals.compute("2026-09");

        assertThat(t.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_MIXED);
        // 명세서 카드사(삼성 890,156) + 승인일 카드사(현대 3,208,877)
        assertThat(t.cardSpend()).isEqualTo(4_099_033);
        // 명세서가 있는 카드사만 — 현대 승인일 합계는 여기에 더하지 않는다.
        assertThat(t.cardStatementTotal()).isEqualTo(890_156);
        assertThat(t.statementCount()).isEqualTo(1);
        assertThat(t.expenses()).isEqualTo(6_121_616);
        assertThat(t.essential()).isEqualTo(2_022_583);
    }

    @Test
    void allCompaniesWithStatementsAreStatementSource() {
        approvalRowOn("2026-09-10", "n1", "현대카드", 2_500_000);
        approvalRowOn("2026-09-11", "n2", "삼성카드", 900_000);
        statement("현대카드", "billing", "2026-09", 2_400_000);
        statement("삼성카드", "billing", "2026-09", 890_156);

        MonthlyExpenseTotals.Totals t = totals.compute("2026-09");

        assertThat(t.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_STATEMENT);
        assertThat(t.cardSpend()).isEqualTo(3_290_156);
        assertThat(t.cardStatementTotal()).isEqualTo(3_290_156);
    }

    @Test
    void allCompaniesWithoutStatementsAreApprovalSource() {
        approvalRowOn("2026-09-10", "o1", "현대카드", 1_000_000);
        approvalRowOn("2026-09-11", "o2", "삼성카드", 500_000);
        // 다른 달 명세서는 이 달 판단에 쓰이지 않는다.
        statement("삼성카드", "billing", "2026-10", 700_000);

        MonthlyExpenseTotals.Totals t = totals.compute("2026-09");

        assertThat(t.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_APPROVAL);
        assertThat(t.cardSpend()).isEqualTo(1_500_000);
        assertThat(t.cardStatementTotal()).isZero();
        assertThat(t.statementCount()).isZero();
    }

    @Test
    void companyWithBothStatementAndApprovalUsesStatementWithoutDoubleCounting() {
        // 같은 카드사에 승인일 행이 있어도 명세서가 있으면 그 카드사는 명세서 금액 하나만 쓴다.
        approvalRowOn("2026-09-10", "p1", "삼성카드", 915_220);
        statement("삼성카드", "billing", "2026-09", 890_156);

        MonthlyExpenseTotals.Totals t = totals.compute("2026-09");

        assertThat(t.cardSource()).isEqualTo(MonthlyExpenseTotals.CARD_SOURCE_STATEMENT);
        assertThat(t.cardSpend()).isEqualTo(890_156);
        assertThat(t.cardStatementTotal()).isEqualTo(890_156);
        assertThat(t.statementCount()).isEqualTo(1);
    }
}
