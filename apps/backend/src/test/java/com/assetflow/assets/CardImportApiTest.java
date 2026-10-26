package com.assetflow.assets;

import com.assetflow.assets.CardImportController.ImportRequest;
import com.assetflow.assets.CardImportController.ImportRow;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.auth.TokenService;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.expenses.categories.InMemoryCategoryClassifier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §41 smoke: 서버 재검증 경계(§29.2) — 중복 rowKey 제거, 정수/날짜/필수 검증,
 * 합계는 행에서 재계산, 취소(음수) 허용.
 */
class CardImportApiTest {

    private static final String TOKEN = "Bearer " + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");
    private final InMemoryCardImportLedger ledger = new InMemoryCardImportLedger();
    private final InMemoryMerchantRuleLedger ruleLedger = new InMemoryMerchantRuleLedger();
    private final InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new CardImportController(ledger, ruleLedger, classifier))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService("test-secret-0123456789-0123456789-0123456789")))
                .build();
    }

    private String row(String rowKey, String date, String merchant, long supply, long vat, long gross) {
        return "{\"rowKey\":\"" + rowKey + "\",\"approvedAt\":\"" + date + "\",\"merchantName\":\"" + merchant
                + "\",\"supplyExVat\":" + supply + ",\"vat\":" + vat + ",\"grossAmount\":" + gross
                + ",\"cardMasked\":\"1234\",\"expenseKind\":\"\",\"subCategory\":\"\"}";
    }

    @Test
    void storesRowsAndRecalculatesTotalsFromRows() throws Exception {
        String body = "{\"rows\":[" + row("k1", "2026-10-01", "가맹점A", 9000, 1000, 10000)
                + "," + row("k2", "2026-10-02", "가맹점B", 18000, 2000, 20000) + "],\"merchantRules\":{}}";

        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stored").value(2))
                .andExpect(jsonPath("$.data.totalRows").value(2))
                .andExpect(jsonPath("$.data.totals.gross").value(30000))
                .andExpect(jsonPath("$.data.totals.vat").value(3000));
    }

    @Test
    void duplicateRowKeysAreSkippedWithCount() throws Exception {
        // 같은 rowKey 2건 중 1건만 저장 — 배치 내 중복도 건수로 알린다
        String body = "{\"rows\":[" + row("k1", "2026-10-01", "가맹점A", 9000, 1000, 10000)
                + "," + row("k1", "2026-10-01", "가맹점A", 9000, 1000, 10000) + "],\"merchantRules\":{}}";

        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.received").value(2))
                .andExpect(jsonPath("$.data.stored").value(1))
                .andExpect(jsonPath("$.data.duplicatesInBatch").value(1));
    }

    @Test
    void reversalRowsWithNegativeAmountsAreAllowed() throws Exception {
        // §29.5.2: 삼성의 취소는 음수 금액 — 공급가액+세액=공급대가 는 부호가 같아면 성립
        String body = "{\"rows\":[" + row("k1", "2026-10-01", "취소행", -9000, -1000, -10000) + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stored").value(1))
                .andExpect(jsonPath("$.data.totals.gross").value(-10000));
    }

    @Test
    void supplyInconsistencyIsWarnedNotRejected() throws Exception {
        // 현대카드 가맹점 신고 부가세 변형 — 잘라내지 않고 경고만 (§29.5.3)
        String body = "{\"rows\":[" + row("k1", "2026-10-01", "가맹점A", 9000, 2000, 10000) + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.supplyInconsistentRows").value(1));
    }

    @Test
    void invalidRowsAreRejectedWithStandard400() throws Exception {
        // 누락된 rowKey
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rows\":[{\"rowKey\":\" \",\"approvedAt\":\"2026-10-01\",\"merchantName\":\"A\",\"supplyExVat\":1,\"vat\":0,\"grossAmount\":1}],\"merchantRules\":{}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        // ISO 날짜 아님
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rows\":[{\"rowKey\":\"k\",\"approvedAt\":\"2026.10.01\",\"merchantName\":\"A\",\"supplyExVat\":1,\"vat\":0,\"grossAmount\":1}],\"merchantRules\":{}}"))
                .andExpect(status().isBadRequest());

        // 금액 누락
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rows\":[{\"rowKey\":\"k\",\"approvedAt\":\"2026-10-01\",\"merchantName\":\"A\",\"vat\":0,\"grossAmount\":1}],\"merchantRules\":{}}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void emptyBatchIs400() throws Exception {
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rows\":[],\"merchantRules\":{}}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rowKeysEndpointSupportsPreviewDedupe() throws Exception {
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rows\":[" + row("k1", "2026-10-01", "A", 9, 1, 10) + "],\"merchantRules\":{}}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports/row-keys").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0]").value("k1"));
    }

    @Test
    void unauthenticatedAccessIsBlocked() throws Exception {
        mvc.perform(get("/api/v1/assets/card-imports/row-keys"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void monthRowsReturnsOnlyThatMonth() throws Exception {
        ledger.addAll(List.of(
                new CardImportLedger.ImportedRow("m1", "2025-01-03", "가맹점A", 1000, 100, 1100, "", "", ""),
                new CardImportLedger.ImportedRow("m2", "2025-02-05", "가맹점B", 2000, 200, 2200, "", "", "")));
        mvc.perform(get("/api/v1/assets/card-imports?month=2025-01").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].merchantName").value("가맹점A"));
        mvc.perform(get("/api/v1/assets/card-imports?month=2025/01").header("Authorization", TOKEN))
                .andExpect(status().isBadRequest());
    }

    @Test
    void storedMerchantRulesAreAppliedToUnclassifiedRows() throws Exception {
        ruleLedger.saveAll(Map.of("가맹점A", "사업비용"));

        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "가맹점A", 9000, 1000, 10000)
                + ","
                + row("k2", "2026-10-02", "가맹점B", 18000, 2000, 20000)
                + "],\"merchantRules\":{}}";

        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stored").value(2))
                .andExpect(jsonPath("$.data.totalRows").value(2));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("사업비용"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k2')].expenseKind").value(""));
    }

    @Test
    void submittedRulesOverrideStoredRulesAndPersistForFutureImports() throws Exception {
        ruleLedger.saveAll(Map.of("가맹점A", "사업비용"));

        String first = "{\"rows\":["
                + row("k1", "2026-10-01", "가맹점A", 9000, 1000, 10000)
                + "],\"merchantRules\":{\"가맹점A\":{\"category\":\"개인지출\",\"subCategory\":\"\"}}}";

        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(first))
                .andExpect(status().isOk());

        String second = "{\"rows\":["
                + row("k2", "2026-10-02", "가맹점A", 18000, 2000, 20000)
                + "],\"merchantRules\":{}}";

        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stored").value(1));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.rowKey=='k2')].expenseKind").value("개인지출"));
    }

    @Test
    void merchantRulesEndpointReturnsRulesForRequestedMerchants() throws Exception {
        ruleLedger.saveAll(Map.of("가맹점A", "사업비용", "가맹점B", "개인지출"));

        mvc.perform(get("/api/v1/assets/card-imports/merchant-rules?merchant=가맹점A").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.가맹점A.category").value("사업비용"));
    }

    @Test
    void merchantRulesEndpointAddsKeywordSuggestionForUnknownMerchant() throws Exception {
        // §55.8: 저장된 규칙이 없는 가맹점은 키워드 자동 분류 결과를 제안한다
        classifier.addKeyword("스타벅스", "식비", 0);

        mvc.perform(get("/api/v1/assets/card-imports/merchant-rules?merchant=스타벅스 강남점")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['스타벅스 강남점'].category").value("식비"));
    }

    @Test
    void storedRuleWinsOverKeywordSuggestion() throws Exception {
        classifier.addKeyword("스타벅스", "식비", 0);
        ruleLedger.saveAll(Map.of("스타벅스 강남점", "여가/취미"));

        mvc.perform(get("/api/v1/assets/card-imports/merchant-rules?merchant=스타벅스 강남점")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['스타벅스 강남점'].category").value("여가/취미"));
    }

    @Test
    void reclassifyUpdatesExistingRowsWithKeywordResult() throws Exception {
        // 분류 없이 저장된 기존 행을 일괄 재분류한다 (§55.8)
        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "스타벅스 강남점", 4500, 500, 5000)
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value(""));

        classifier.addKeyword("스타벅스", "식비", 0);

        mvc.perform(post("/api/v1/assets/card-imports/reclassify").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.updated").value(1));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("식비"));
    }

    @Test
    void userCanChangeCategoryOfExistingRowAndRuleAppliesToThatMerchant() throws Exception {
        // 같은 가맹점 2행을 저장한 뒤 k1 만 수정 → 같은 가맹점 k2 도 함께 바뀌고 규칙이 남는다
        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "한국유통용인", 9000, 1000, 10000)
                + ","
                + row("k2", "2026-11-01", "한국유통용인", 18000, 2000, 20000)
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(patch("/api/v1/assets/card-imports/category").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rowKey\":\"k1\",\"category\":\"식비\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.category").value("식비"))
                .andExpect(jsonPath("$.data.updatedRows").value(2));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("식비"));
        mvc.perform(get("/api/v1/assets/card-imports?month=2026-11").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k2')].expenseKind").value("식비"));
        // 다음 임포트에도 자동 적용되도록 가맹점 규칙이 저장된다
        org.junit.jupiter.api.Assertions.assertEquals("식비", ruleLedger.allRules().get("한국유통용인"));
    }

    @Test
    void changingCategoryOfUnknownRowIsRejected() throws Exception {
        mvc.perform(patch("/api/v1/assets/card-imports/category").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rowKey\":\"nope\",\"category\":\"식비\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unclassifiedGroupsAreAggregatedByMerchantAndOrderedByAmount() throws Exception {
        String body = "{\"rows\":["
                + row("k1", "2026-09-01", "가맹점A", 9000, 1000, 10000)
                + "," + row("k2", "2026-10-01", "가맹점A", 18000, 2000, 20000)
                + "," + row("k3", "2026-10-02", "가맹점B", 4500, 500, 5000)
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports/unclassified").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].merchantName").value("가맹점A"))
                .andExpect(jsonPath("$.data[0].count").value(2))
                .andExpect(jsonPath("$.data[0].grossTotal").value(30000))
                .andExpect(jsonPath("$.data[0].firstApprovedAt").value("2026-09-01"))
                .andExpect(jsonPath("$.data[0].lastApprovedAt").value("2026-10-01"))
                .andExpect(jsonPath("$.data[1].merchantName").value("가맹점B"));
    }

    @Test
    void merchantCategoryAssignsAllRowsAndUndoRestoresUnclassified() throws Exception {
        String body = "{\"rows\":["
                + row("k1", "2026-09-01", "가맹점A", 9000, 1000, 10000)
                + "," + row("k2", "2026-10-01", "가맹점A", 18000, 2000, 20000)
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(patch("/api/v1/assets/card-imports/merchant-category").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"merchantName\":\"가맹점A\",\"category\":\"식비\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updatedRows").value(2));
        org.junit.jupiter.api.Assertions.assertEquals("식비", ruleLedger.allRules().get("가맹점A"));
        mvc.perform(get("/api/v1/assets/card-imports/unclassified").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(0));

        // 되돌리기: 빈 카테고리 → 미분류 복원 + 규칙 삭제
        mvc.perform(patch("/api/v1/assets/card-imports/merchant-category").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"merchantName\":\"가맹점A\",\"category\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updatedRows").value(2));
        org.junit.jupiter.api.Assertions.assertNull(ruleLedger.allRules().get("가맹점A"));
        mvc.perform(get("/api/v1/assets/card-imports/unclassified").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].merchantName").value("가맹점A"))
                .andExpect(jsonPath("$.data[0].count").value(2));
    }
}
