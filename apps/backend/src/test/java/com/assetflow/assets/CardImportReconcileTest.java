package com.assetflow.assets;

import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.expenses.InMemoryExpenseItemLedger;
import com.assetflow.expenses.categories.InMemoryCategoryClassifier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CARD-MERGE-2: CSV 가 덮는 기간의 이메일/미상 행 정리(reconcile).
 *
 * <p>이메일 명세서는 금액 표기가 달라(이용금액·부가세 0·승인번호 없음) CSV 와 자연키가
 * 어긋난다. 그래서 같은 거래인데도 병합되지 못한 이메일 행이 잔재로 남는다.
 * CSV 가 그 기간을 덮으면 그 기간의 정본은 CSV 이므로 잔재를 지운다.
 * 단, 다른 카드사·기간 밖·csv 행은 보존한다.</p>
 */
class CardImportReconcileTest {

    private static final String TOKEN =
            "Bearer " + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");

    private final InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
    private final InMemoryMerchantRuleLedger ruleLedger = new InMemoryMerchantRuleLedger();
    private final InMemoryMerchantBusinessCategoryLedger businessCategoryLedger =
            new InMemoryMerchantBusinessCategoryLedger();
    private final InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
    private final InMemoryExpenseItemLedger expenseItems = new InMemoryExpenseItemLedger();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(
                        new CardImportController(ledger, ruleLedger, businessCategoryLedger, classifier, expenseItems))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService("test-secret-0123456789-0123456789-0123456789")))
                .build();
    }

    /** 이메일 행은 부가세 0·이용금액=승인금액, 승인번호 없음 — 실제 VestMail 행의 표기. */
    private static CardImportLedger.ImportedRow row(String rowKey, String company, String approvedAt,
                                                    String merchant, long gross, String source) {
        return new CardImportLedger.ImportedRow(
                rowKey, approvedAt, merchant, gross, 0, gross,
                "본인 카드", "", "", "", "", "본인", company, source);
    }

    /** CSV 업로드가 덮는 기간(10/01~10/31)의 이메일·미상 잔재를 남긴 원장. */
    private InMemoryCardImportLedger ledgerWithResidue() {
        InMemoryCardImportLedger l = new InMemoryCardImportLedger();
        l.addAll(List.of(
                // 기간 안·같은 카드사 — 지워져야 한다 (현대카드 실측 잔재 49,113원)
                row("email|27", "현대카드", "2026-10-27", "합성마트 합성지점", 30000, CardImportLedger.SOURCE_EMAIL),
                row("email|31", "현대카드", "2026-10-31", "합성주유소", 19113, CardImportLedger.SOURCE_EMAIL),
                row("unknown|28", "현대카드", "2026-10-28", "합성카페", 5500, CardImportLedger.SOURCE_UNKNOWN),
                // 기간 안·다른 카드사 — 남는다
                row("email|s27", "삼성카드", "2026-10-27", "합성마트 합성지점", 30000, CardImportLedger.SOURCE_EMAIL),
                // 기간 밖·같은 카드사 — 남는다
                row("email|n05", "현대카드", "2026-11-05", "합성서점", 12000, CardImportLedger.SOURCE_EMAIL),
                row("email|p30", "현대카드", "2026-09-30", "합성서점", 12000, CardImportLedger.SOURCE_EMAIL),
                // 기간 안·같은 카드사 csv — 절대 지우지 않는다
                row("csv|keep", "현대카드", "2026-10-15", "합성문구", 8000, CardImportLedger.SOURCE_CSV)));
        return l;
    }

    /** AC1: 같은 카드사·덮는 기간의 이메일/미상 행이 삭제되고 csv 행만 남는다. */
    @Test
    void deletesEmailAndUnknownRowsInsideCsvCoveredRange() {
        InMemoryCardImportLedger l = ledgerWithResidue();

        int deleted = l.deleteUnconfirmedInRange("현대카드", "2026-10-01", "2026-10-31");

        assertThat(deleted).isEqualTo(3);
        assertThat(l.all()).extracting(CardImportLedger.ImportedRow::rowKey)
                .doesNotContain("email|27", "email|31", "unknown|28");
    }

    /** AC2-1: 다른 카드사의 이메일 행은 그 기간에 있어도 남는다. */
    @Test
    void keepsEmailRowsOfOtherCardCompanies() {
        InMemoryCardImportLedger l = ledgerWithResidue();

        l.deleteUnconfirmedInRange("현대카드", "2026-10-01", "2026-10-31");

        assertThat(l.all()).extracting(CardImportLedger.ImportedRow::rowKey).contains("email|s27");
    }

    /** AC2-2: 기간 밖(경계 09/30·11/05)의 이메일 행은 남는다. */
    @Test
    void keepsEmailRowsOutsideCoveredRange() {
        InMemoryCardImportLedger l = ledgerWithResidue();

        l.deleteUnconfirmedInRange("현대카드", "2026-10-01", "2026-10-31");

        assertThat(l.all()).extracting(CardImportLedger.ImportedRow::rowKey)
                .contains("email|p30", "email|n05");
    }

    /** AC4: source='csv' 행은 어떤 경우에도 삭제되지 않는다. */
    @Test
    void neverDeletesCsvRows() {
        InMemoryCardImportLedger l = ledgerWithResidue();

        // csv 행만 있는 넓은 범위를 요청해도 csv 는 남는다.
        int deleted = l.deleteUnconfirmedInRange("현대카드", "2000-01-01", "2099-12-31");

        // 현대카드 email 3건 + 기간 밖 email 2건이 이 넓은 범위에 들어와 지워진다.
        assertThat(deleted).isEqualTo(5);
        assertThat(l.all()).extracting(CardImportLedger.ImportedRow::rowKey)
                .containsExactlyInAnyOrder("csv|keep", "email|s27");
        assertThat(l.all()).filteredOn(r -> CardImportLedger.SOURCE_CSV.equals(r.source())).hasSize(1);
    }

    /** 범위가 비어 있으면(빈 문자열) 아무것도 지우지 않는다 — 전체 삭제로 번지지 않게. */
    @Test
    void blankRangeDeletesNothing() {
        InMemoryCardImportLedger l = ledgerWithResidue();
        int before = l.all().size();

        assertThat(l.deleteUnconfirmedInRange("현대카드", "", "")).isZero();
        assertThat(l.all()).hasSize(before);
    }

    /** AC3: submit 응답의 reconciled 가 삭제 건수와 일치하고, 남은 행에 이메일 잔재가 없다. */
    @Test
    void submitReconcilesAndReportsDeletedCount() throws Exception {
        ledger.addAll(List.of(
                row("email|27", "현대카드", "2026-10-27", "합성마트 합성지점", 30000, CardImportLedger.SOURCE_EMAIL),
                row("email|31", "현대카드", "2026-10-31", "합성주유소", 19113, CardImportLedger.SOURCE_EMAIL),
                row("email|s27", "삼성카드", "2026-10-27", "합성마트 합성지점", 30000, CardImportLedger.SOURCE_EMAIL)));

        // CSV 업로드: 현대카드 10/01 ~ 10/31. 이메일과 금액 표기가 달라 병합되지 않는 거래만 넣는다.
        String body = "{\"rows\":["
                + csvRow("csv|1", "2026-10-01", "합성마트 - 합성지점", 10000, 1000, 11000)
                + "," + csvRow("csv|2", "2026-10-31", "합성주유소", 50000, 5000, 55000)
                + "],\"merchantRules\":{}}";

        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stored").value(2))
                .andExpect(jsonPath("$.data.reconciled").value(2))
                // 응답 합계는 정리 뒤 남은 행에서 재계산된다(이메일 잔재 49,113 제외, 삼성 이메일 30,000 은 유지)
                .andExpect(jsonPath("$.data.totals.gross").value(96000))
                .andExpect(jsonPath("$.data.totalRows").value(3));

        // 현대카드 이메일 잔재는 사라지고, 다른 카드사 이메일 행은 남는다.
        assertThat(ledger.all()).extracting(CardImportLedger.ImportedRow::rowKey)
                .containsExactlyInAnyOrder("csv|1", "csv|2", "email|s27");
    }

    private static String csvRow(String rowKey, String approvedAt, String merchant,
                                 long supply, long vat, long gross) {
        return "{\"rowKey\":\"" + rowKey + "\",\"approvedAt\":\"" + approvedAt + "\""
                + ",\"merchantName\":\"" + merchant + "\",\"supplyExVat\":" + supply
                + ",\"vat\":" + vat + ",\"grossAmount\":" + gross
                + ",\"cardMasked\":\"****1111\",\"expenseKind\":\"\",\"subCategory\":\"\""
                + ",\"cardCompany\":\"현대카드\",\"source\":\"csv\"}";
    }
}
