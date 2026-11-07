package com.assetflow.assets;

import com.assetflow.assets.CardImportController.ImportRequest;
import com.assetflow.assets.CardImportController.ImportRow;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.auth.TokenService;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.expenses.InMemoryExpenseItemLedger;
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

    private String row(String rowKey, String date, String merchant, long supply, long vat, long gross) {
        return "{\"rowKey\":\"" + rowKey + "\",\"approvedAt\":\"" + date + "\",\"merchantName\":\"" + merchant
                + "\",\"supplyExVat\":" + supply + ",\"vat\":" + vat + ",\"grossAmount\":" + gross
                + ",\"cardMasked\":\"1234\",\"expenseKind\":\"\",\"subCategory\":\"\"}";
    }

    private String rowWithCardInfo(String rowKey, String date, String merchant, long supply, long vat, long gross,
                                   String memberRelation, String cardCompany) {
        return "{\"rowKey\":\"" + rowKey + "\",\"approvedAt\":\"" + date + "\",\"merchantName\":\"" + merchant
                + "\",\"supplyExVat\":" + supply + ",\"vat\":" + vat + ",\"grossAmount\":" + gross
                + ",\"cardMasked\":\"1234\",\"expenseKind\":\"\",\"subCategory\":\"\""
                + ",\"memberRelation\":\"" + memberRelation + "\",\"cardCompany\":\"" + cardCompany + "\"}";
    }

    private String row(String rowKey, String date, String merchant, long supply, long vat, long gross,
                       String businessNo, String businessCategory) {
        return "{\"rowKey\":\"" + rowKey + "\",\"approvedAt\":\"" + date + "\",\"merchantName\":\"" + merchant
                + "\",\"supplyExVat\":" + supply + ",\"vat\":" + vat + ",\"grossAmount\":" + gross
                + ",\"cardMasked\":\"1234\",\"expenseKind\":\"\",\"subCategory\":\"\","
                + "\"businessNo\":\"" + businessNo + "\",\"businessCategory\":\"" + businessCategory + "\"}";
    }

    @Test
    void monthlyCategoriesAggregateByMonthAndExcludeAssetTransfers() throws Exception {
        String body = "{\"rows\":["
                + rowWithCategory("k1", "2026-08-10", "식당", 10000, "식비", "외식") + ","
                + rowWithCategory("k2", "2026-09-05", "통신사", 20000, "주거/통신", "통신비") + ","
                + rowWithCategory("k3", "2026-09-06", "증권사", 30000, "금융/세금", "저축/투자") + ","
                + rowWithCategory("k4", "2026-10-01", "알수없는가맹점", 5000, "", "")
                + "],\"merchantRules\":{}}";

        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports/monthly-categories")
                        .header("Authorization", TOKEN)
                        .param("from", "2026-08").param("to", "2026-10"))
                .andExpect(status().isOk())
                // 자산 이동(저축/투자)은 지출이 아니다 — 빠진다
                .andExpect(jsonPath("$.data.length()").value(3))
                .andExpect(jsonPath("$.data[0].month").value("2026-08"))
                .andExpect(jsonPath("$.data[0].category").value("식비"))
                .andExpect(jsonPath("$.data[0].gross").value(10000))
                .andExpect(jsonPath("$.data[1].category").value("주거/통신"))
                .andExpect(jsonPath("$.data[1].gross").value(20000))
                .andExpect(jsonPath("$.data[2].category").value("미분류"))
                .andExpect(jsonPath("$.data[2].gross").value(5000));
    }

    @Test
    void monthlyCategoriesIncludeFixedItemsAndSkipUncategorized() throws Exception {
        // §57.6: 고정/정기 항목도 지출 추이에 들어간다. 대분류가 없는 항목(카드대금)은 이중계상을 막기 위해 뺀다.
        expenseItems.create("2026-09", "교육비", 1_000_000, true, 0, "교육");
        expenseItems.create("2026-09", "여리카드대금", 500_000, false, 0, null);
        expenseItems.create("2026-10", "교육비", 1_000_000, true, 0, "교육");
        expenseItems.create("2026-10", "식비 항목", 5_000, false, 0, "식비");

        String body = "{\"rows\":["
                + rowWithCategory("k1", "2026-09-05", "식당", 10000, "식비", "외식") + ","
                + rowWithCategory("k2", "2026-10-02", "식당", 7000, "식비", "외식")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports/monthly-categories")
                        .header("Authorization", TOKEN)
                        .param("from", "2026-09").param("to", "2026-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(4))
                // 2026-09: 식비(카드 10,000) + 교육(항목 1,000,000) — 카드대금 500,000 은 빠진다
                .andExpect(jsonPath("$.data[0].month").value("2026-09"))
                .andExpect(jsonPath("$.data[0].category").value("교육"))
                .andExpect(jsonPath("$.data[0].gross").value(1_000_000))
                .andExpect(jsonPath("$.data[1].category").value("식비"))
                .andExpect(jsonPath("$.data[1].gross").value(10_000))
                // 2026-10: 같은 달·같은 대분류이면 카드와 항목을 합산한다
                .andExpect(jsonPath("$.data[2].month").value("2026-10"))
                .andExpect(jsonPath("$.data[2].category").value("교육"))
                .andExpect(jsonPath("$.data[2].gross").value(1_000_000))
                .andExpect(jsonPath("$.data[3].category").value("식비"))
                .andExpect(jsonPath("$.data[3].gross").value(12_000));
    }

    @Test
    void monthlyCategoriesSourceCardExcludesFixedItems() throws Exception {
        // §59: 비상금 유지 개월의 변동지출 평균은 카드 소비만 본다.
        expenseItems.create("2026-09", "교육비", 1_000_000, true, 0, "교육");
        String body = "{\"rows\":["
                + rowWithCategory("k1", "2026-09-05", "식당", 10000, "식비", "외식") + ","
                + rowWithCategory("k2", "2026-09-06", "증권사", 30000, "금융/세금", "저축/투자")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports/monthly-categories")
                        .header("Authorization", TOKEN)
                        .param("from", "2026-09").param("to", "2026-09")
                        .param("source", "card"))
                .andExpect(status().isOk())
                // 고정 항목(교육 1,000,000)과 자산 이동(저축/투자)은 빠진다
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].category").value("식비"))
                .andExpect(jsonPath("$.data[0].gross").value(10_000));

        // source=all(기본)은 그대로 카드 + 항목을 합친다
        mvc.perform(get("/api/v1/assets/card-imports/monthly-categories")
                        .header("Authorization", TOKEN)
                        .param("from", "2026-09").param("to", "2026-09")
                        .param("source", "all"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    @Test
    void monthlyCategoriesRejectUnknownSource() throws Exception {
        mvc.perform(get("/api/v1/assets/card-imports/monthly-categories")
                        .header("Authorization", TOKEN)
                        .param("from", "2026-09").param("to", "2026-09")
                        .param("source", "manual"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void monthlyCategoriesRejectBadRange() throws Exception {
        mvc.perform(get("/api/v1/assets/card-imports/monthly-categories")
                        .header("Authorization", TOKEN)
                        .param("from", "2026-10").param("to", "2026-08"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/v1/assets/card-imports/monthly-categories")
                        .header("Authorization", TOKEN)
                        .param("from", "2020-01").param("to", "2026-10"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void monthlyCategoriesAllowUpTo36MonthsInclusive() throws Exception {
        // 36개월(양끝 포함)까지 허용 — 2023-11 ~ 2026-10 은 36개월
        mvc.perform(get("/api/v1/assets/card-imports/monthly-categories")
                        .header("Authorization", TOKEN)
                        .param("from", "2023-11").param("to", "2026-10"))
                .andExpect(status().isOk());

        // 37개월은 거절 — 2023-10 ~ 2026-10
        mvc.perform(get("/api/v1/assets/card-imports/monthly-categories")
                        .header("Authorization", TOKEN)
                        .param("from", "2023-10").param("to", "2026-10"))
                .andExpect(status().isBadRequest());
    }

    private String rowWithCategory(String rowKey, String date, String merchant, long gross,
                                   String category, String subCategory) {
        return "{\"rowKey\":\"" + rowKey + "\",\"approvedAt\":\"" + date + "\",\"merchantName\":\"" + merchant
                + "\",\"supplyExVat\":" + gross + ",\"vat\":0,\"grossAmount\":" + gross
                + ",\"cardMasked\":\"1234\",\"expenseKind\":\"" + category + "\",\"subCategory\":\"" + subCategory + "\"}";
    }

    private String rowWithExpenseKind(String rowKey, String date, String merchant, long gross,
                                      String expenseKind, String businessCategory) {
        return "{\"rowKey\":\"" + rowKey + "\",\"approvedAt\":\"" + date + "\",\"merchantName\":\"" + merchant
                + "\",\"supplyExVat\":" + gross + ",\"vat\":0,\"grossAmount\":" + gross
                + ",\"cardMasked\":\"1234\",\"expenseKind\":\"" + expenseKind + "\",\"subCategory\":\"\","
                + "\"businessNo\":\"9999999901\",\"businessCategory\":\"" + businessCategory + "\"}";
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
                new CardImportLedger.ImportedRow("m1", "2025-01-03", "가맹점A", 1000, 100, 1100, "", "", "", "", "", "", ""),
                new CardImportLedger.ImportedRow("m2", "2025-02-05", "가맹점B", 2000, 200, 2200, "", "", "", "", "", "", "")));
        mvc.perform(get("/api/v1/assets/card-imports?month=2025-01").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].merchantName").value("가맹점A"));
        mvc.perform(get("/api/v1/assets/card-imports?month=2025/01").header("Authorization", TOKEN))
                .andExpect(status().isBadRequest());
    }

    @Test
    void byCardGroupsByCompanyAndMemberRelation() throws Exception {
        String body = "{\"rows\":["
                + rowWithCardInfo("h1", "2026-10-01", "가맹점A", 9091, 909, 10000, "본인", "현대카드") + ","
                + rowWithCardInfo("h2", "2026-10-02", "가맹점B", 8182, 818, 9000, "가족", "현대카드") + ","
                + rowWithCardInfo("s1", "2026-10-03", "가맹점C", 7273, 727, 8000, "본인", "삼성카드")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports/by-card?from=2026-10&to=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(3))
                .andExpect(jsonPath("$.data[0].month").value("2026-10"))
                .andExpect(jsonPath("$.data[?(@.cardCompany=='현대카드' && @.memberRelation=='본인')].grossAmount").value(10000))
                .andExpect(jsonPath("$.data[?(@.cardCompany=='현대카드' && @.memberRelation=='가족')].grossAmount").value(9000))
                .andExpect(jsonPath("$.data[?(@.cardCompany=='삼성카드' && @.memberRelation=='본인')].grossAmount").value(8000));
    }

    @Test
    void backfillCardCompanyInfersFromSameMaskedCard() throws Exception {
        // 카드번호가 같은 행 중 일부는 카드사가 있고, 일부는 비어 있다.
        String known = rowWithCardInfo("k1", "2026-10-01", "가맹점A", 9091, 909, 10000, "본인", "현대카드");
        String unknown = "{\"rowKey\":\"u1\",\"approvedAt\":\"2026-10-02\",\"merchantName\":\"가맹점B\","
                + "\"supplyExVat\":1818,\"vat\":182,\"grossAmount\":2000,\"cardMasked\":\"1234\","
                + "\"expenseKind\":\"\",\"subCategory\":\"\",\"memberRelation\":\"가족\"}";
        String body = "{\"rows\":[" + known + "," + unknown + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/assets/card-imports/backfill-card-company").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updated").value(1));

        mvc.perform(get("/api/v1/assets/card-imports/by-card?from=2026-10&to=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[?(@.cardCompany=='현대카드' && @.memberRelation=='가족')].grossAmount").value(2000));
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

        mvc.perform(post("/api/v1/assets/card-imports/merchant-rules")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"merchants\":[\"가맹점A\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.가맹점A.category").value("사업비용"));
    }

    @Test
    void merchantRulesEndpointAddsKeywordSuggestionForUnknownMerchant() throws Exception {
        // §55.8: 저장된 규칙이 없는 가맹점은 키워드 자동 분류 결과를 제안한다
        classifier.addKeyword("스타벅스", "식비", 0);

        mvc.perform(post("/api/v1/assets/card-imports/merchant-rules")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"merchants\":[\"스타벅스 강남점\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['스타벅스 강남점'].category").value("식비"));
    }

    @Test
    void storedRuleWinsOverKeywordSuggestion() throws Exception {
        classifier.addKeyword("스타벅스", "식비", 0);
        ruleLedger.saveAll(Map.of("스타벅스 강남점", "여가/취미"));

        mvc.perform(post("/api/v1/assets/card-imports/merchant-rules")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"merchants\":[\"스타벅스 강남점\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['스타벅스 강남점'].category").value("여가/취미"));
    }

    @Test
    void reclassifyKeepsCategorizedRowsWhenLegacyRuleSaysUnclassified() throws Exception {
        // §66 회귀: legacy 규칙 category='unclassified' + 세부 '통신비'.
        // 과거에는 재분류가 이 값을 그대로 써서 잘 분류된 행을 미분류로 덮어썼다.
        String body = "{\"rows\":["
                + rowWithCategory("k1", "2026-10-01", "KT통신", 9000, "주거/통신", "통신비")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        // legacy 데이터: 대분류만 잃어버린 규칙 (운영에서는 merchant_rules 테이블, 테스트에서는 두 곳)
        ruleLedger.saveAllDetails(Map.of("KT통신",
                new MerchantRuleLedger.MerchantRule("unclassified", "통신비")));
        classifier.addRule("KT통신", "unclassified", "통신비");

        mvc.perform(post("/api/v1/assets/card-imports/reclassify").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rulesRepaired").value(1));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("주거/통신"));
        // 규칙도 'unclassified' 에서 벗어난다 — 다음 재분류가 다시 덮어쓰지 않게.
        org.assertj.core.api.Assertions.assertThat(ruleLedger.allRuleDetails().get("KT통신").category())
                .isEqualTo("주거/통신");
    }

    @Test
    void reclassifySkipsMerchantWithoutAnyCategoryInsteadOfWritingUnclassified() throws Exception {
        // §66: 규칙·세부·키워드·업종 어디에도 단서가 없으면 행을 건드리지 않는다.
        // (예전에는 규칙의 'unclassified' 를 그대로 써서 미분류로 덮어썼다.)
        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "알수없는가맹점", 5000, 500, 5500)
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        ruleLedger.saveAllDetails(Map.of("알수없는가맹점",
                new MerchantRuleLedger.MerchantRule("unclassified", "")));
        classifier.addRule("알수없는가맹점", "unclassified", "");

        mvc.perform(post("/api/v1/assets/card-imports/reclassify").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updated").value(0))
                .andExpect(jsonPath("$.data.rulesRepaired").value(0));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value(""));
    }

    @Test
    void reclassifySavesRulesWithDerivedGroupWhenOnlySubCategorySurvives() throws Exception {
        // §66: legacy 규칙에 세부만 남아 있으면 그 세부로 대분류를 되살리고 규칙도 고친다.
        String body = "{\"rows\":["
                + rowWithCategory("k1", "2026-10-01", "KT통신", 9000, "주거/통신", "통신비")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        ruleLedger.saveAllDetails(Map.of("KT통신",
                new MerchantRuleLedger.MerchantRule("unclassified", "통신비")));
        classifier.addRule("KT통신", "unclassified", "통신비");

        mvc.perform(post("/api/v1/assets/card-imports/reclassify").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rulesRepaired").value(1));

        org.assertj.core.api.Assertions.assertThat(ruleLedger.allRuleDetails().get("KT통신").category())
                .isEqualTo("주거/통신");
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
    void categoryChangeSavesGenericBusinessRuleForUniqueNumber() throws Exception {
        ledger.addAll(List.of(new CardImportLedger.ImportedRow(
                "k1", "2026-10-01", "테스트가맹점A", 9000, 1000, 10000,
                "", "", "", "9999999911", "", "본인", "현대카드")));

        mvc.perform(patch("/api/v1/assets/card-imports/category").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rowKey\":\"k1\",\"category\":\"식비\",\"subCategory\":\"외식\"}"))
                .andExpect(status().isOk());

        List<MerchantBusinessCategoryLedger.Mapping> mappings =
                businessCategoryLedger.mappingsFor("9999999911");
        org.assertj.core.api.Assertions.assertThat(mappings).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(mappings.get(0).source()).isEqualTo("user");
        org.assertj.core.api.Assertions.assertThat(mappings.get(0).merchantPattern()).isEmpty();
        org.assertj.core.api.Assertions.assertThat(mappings.get(0).category()).isEqualTo("식비");
    }

    @Test
    void categoryChangeUsesMerchantPatternForSharedBusinessNumber() throws Exception {
        // 같은 사업자번호를 쓰지만 카테고리가 다른 두 가맹점 — 일반 매핑이면 오분류된다.
        ledger.addAll(List.of(
                new CardImportLedger.ImportedRow(
                        "k1", "2026-10-01", "KCP - 테스트A", 9000, 1000, 10000,
                        "", "", "", "9999999922", "", "본인", "현대카드"),
                new CardImportLedger.ImportedRow(
                        "k2", "2026-10-02", "KCP - 테스트B", 9000, 1000, 10000,
                        "", "쇼핑/생활", "", "9999999922", "", "본인", "현대카드")));

        mvc.perform(patch("/api/v1/assets/card-imports/category").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rowKey\":\"k1\",\"category\":\"식비\",\"subCategory\":\"외식\"}"))
                .andExpect(status().isOk());

        List<MerchantBusinessCategoryLedger.Mapping> mappings =
                businessCategoryLedger.mappingsFor("9999999922");
        org.assertj.core.api.Assertions.assertThat(mappings).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(mappings.get(0).merchantPattern()).isEqualTo("테스트a");
        org.assertj.core.api.Assertions.assertThat(mappings.get(0).category()).isEqualTo("식비");
    }

    @Test
    void revertingMerchantCategoryDeletesUserBusinessRule() throws Exception {
        ledger.addAll(List.of(new CardImportLedger.ImportedRow(
                "k1", "2026-10-01", "되돌릴가맹점", 9000, 1000, 10000,
                "", "식비", "외식", "9999999912", "", "본인", "현대카드")));
        ruleLedger.saveAllDetails(Map.of("되돌릴가맹점", new MerchantRuleLedger.MerchantRule("식비", "외식")));
        mvc.perform(patch("/api/v1/assets/card-imports/merchant-category").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"merchantName\":\"되돌릴가맹점\",\"category\":\"식비\",\"subCategory\":\"외식\"}"))
                .andExpect(status().isOk());
        org.assertj.core.api.Assertions.assertThat(
                businessCategoryLedger.mappingsFor("9999999912")).hasSize(1);

        mvc.perform(patch("/api/v1/assets/card-imports/merchant-category").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"merchantName\":\"되돌릴가맹점\",\"category\":\"\"}"))
                .andExpect(status().isOk());

        org.assertj.core.api.Assertions.assertThat(
                businessCategoryLedger.mappingsFor("9999999912")).isEmpty();
    }

    @Test
    void backfillPromotesExistingMerchantRulesToBusinessRules() throws Exception {
        ledger.addAll(List.of(new CardImportLedger.ImportedRow(
                "k1", "2026-10-01", "백필가맹점", 9000, 1000, 10000,
                "", "식비", "외식", "9999999933", "", "본인", "현대카드")));
        ruleLedger.saveAllDetails(Map.of("백필가맹점",
                new MerchantRuleLedger.MerchantRule("식비", "외식")));

        mvc.perform(post("/api/v1/assets/card-imports/backfill-business-rules").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved").value(1));

        List<MerchantBusinessCategoryLedger.Mapping> mappings =
                businessCategoryLedger.mappingsFor("9999999933");
        org.assertj.core.api.Assertions.assertThat(mappings).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(mappings.get(0).category()).isEqualTo("식비");
        org.assertj.core.api.Assertions.assertThat(mappings.get(0).merchantPattern()).isEmpty();
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

    @Test
    void businessCategoryIsUsedWhenMerchantRuleAndKeywordMiss() throws Exception {
        // §55.8.9: 가맹점명이 낯설어도 명세서 업종이 분명하면 대분류/세부를 채운다.
        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "알수없는가맹점", 9000, 1000, 10000, "9999999901", "한식")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("식비"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value("외식"));
    }

    @Test
    void ambiguousBusinessCategoryLeavesRowUnclassified() throws Exception {
        // PG/온라인거래 업종은 실제 구매처를 알 수 없다 — 업종만으로 분류하지 않는다.
        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "알수없는가맹점", 9000, 1000, 10000, "9999999901", "PG_일반인증")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value(""))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value(""));
    }

    @Test
    void merchantKeywordWinsOverBusinessCategory() throws Exception {
        classifier.addKeyword("스타벅스", "식비", "카페/간식", 0);

        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "스타벅스 강남점", 9000, 1000, 10000, "9999999901", "주유소")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("식비"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value("카페/간식"));
    }

    @Test
    void storedRuleWinsOverBusinessCategory() throws Exception {
        ruleLedger.saveAll(Map.of("알수없는가맹점", "사업비용"));

        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "알수없는가맹점", 9000, 1000, 10000, "9999999901", "한식")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("사업비용"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value(""));
    }

    @Test
    void merchantRulesEndpointUsesBusinessCategorySuggestion() throws Exception {
        mvc.perform(post("/api/v1/assets/card-imports/merchant-rules").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"merchants\":[\"알수없는가맹점\"],"
                                + "\"businessCategories\":{\"알수없는가맹점\":\"한식\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['알수없는가맹점'].category").value("식비"))
                .andExpect(jsonPath("$.data['알수없는가맹점'].subCategory").value("외식"));
    }

    @Test
    void reclassifyUsesBusinessCategoryOfAlreadyStoredRows() throws Exception {
        ledger.addAll(List.of(new CardImportLedger.ImportedRow(
                "k1", "2026-10-01", "알수없는가맹점", 9000, 1000, 10000,
                "", "", "", "9999999901", "주유소", "", "")));

        mvc.perform(post("/api/v1/assets/card-imports/reclassify").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updated").value(1));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("교통/차량"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value("차량유지비"));
    }

    @Test
    void businessNumberIsUsedBeforeMerchantKeyword() throws Exception {
        // §67: 사업자번호가 키워드보다 정확하다 — 이름에 '병원' 이 있어도 매핑이 우선한다.
        classifier.addKeyword("병원", "건강/의료", "병원비", 0);
        classifier.addBusinessNo("9999999902", "교통/차량", "차량유지비");

        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "서울병원", 9000, 1000, 10000, "999-99-99902", "")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("교통/차량"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value("차량유지비"));
    }

    @Test
    void pgBusinessNumberIsDisambiguatedByMerchantName() throws Exception {
        // §67: KCP 사업자번호는 공유된다 — 가맹점명이 넷플릭스면 문화/여가, 배달의민족이면 배달.
        classifier.addBusinessNoPattern("1138521083", "넷플릭스", "문화/여가", "취미/여가");
        classifier.addBusinessNoPattern("1138521083", "우아한형제들", "식비", "배달");

        String body = "{\"rows\":["
                + row("k1", "2026-10-01", "KCP - 넷플릭스서비시스코리아", 9000, 1000, 10000, "1138521083", "")
                + "," + row("k2", "2026-10-02", "KCP - 주식회사 우아한형제들", 9000, 1000, 10000, "1138521083", "")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("문화/여가"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value("취미/여가"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k2')].expenseKind").value("식비"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k2')].subCategory").value("배달"));
    }

    @Test
    void reclassifyUsesBusinessNumberMappingOfAlreadyStoredRows() throws Exception {
        // 저장된 행에 사업자번호만 있으면 재분류 때 매핑을 적용한다.
        ledger.addAll(List.of(new CardImportLedger.ImportedRow(
                "k1", "2026-10-01", "알수없는가맹점", 9000, 1000, 10000,
                "", "", "", "9999999903", "PG_일반인증", "", "")));
        classifier.addBusinessNo("9999999903", "건강/의료", "약국");

        mvc.perform(post("/api/v1/assets/card-imports/reclassify").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updated").value(1));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("건강/의료"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value("약국"));
    }

    @Test
    void merchantRulesEndpointUsesBusinessNumberSuggestion() throws Exception {
        classifier.addBusinessNo("9999999904", "문화/여가", "여행/숙박");

        mvc.perform(post("/api/v1/assets/card-imports/merchant-rules").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"merchants\":[\"알수없는숙소\"],"
                                + "\"businessNos\":{\"알수없는숙소\":\"9999999904\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['알수없는숙소'].category").value("문화/여가"))
                .andExpect(jsonPath("$.data['알수없는숙소'].subCategory").value("여행/숙박"));
    }

    @Test
    void parserDefaultUnclassifiedDoesNotOverrideKeywordSuggestion() throws Exception {
        // 파서는 모든 행에 expenseKind="unclassified" 를 넣는다. 이 값을 실제 카테고리로
        // 취급하면 자동 분류 결과를 덮어써 저장 행이 미분류로 남는다.
        classifier.addKeyword("스타벅스", "식비", "카페/간식", 0);

        String body = "{\"rows\":["
                + rowWithExpenseKind("k1", "2026-10-01", "스타벅스 강남점", 10000, "unclassified", "주유소")
                + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("식비"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value("카페/간식"));
        // "unclassified" 라는 규칙이 저장돼 다음 임포트를 막아서도 안 된다.
        org.junit.jupiter.api.Assertions.assertEquals("식비", ruleLedger.allRules().get("스타벅스 강남점"));
    }

    @Test
    void parserDefaultUnclassifiedDoesNotOverrideSubmittedRule() throws Exception {
        String body = "{\"rows\":["
                + rowWithExpenseKind("k1", "2026-10-01", "알수없는가맹점", 10000, "unclassified", "한식")
                + "],\"merchantRules\":{\"알수없는가맹점\":{\"category\":\"교육\",\"subCategory\":\"학원/교육\"}}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].expenseKind").value("교육"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='k1')].subCategory").value("학원/교육"));
    }

    @Test
    void memberRelationIsStoredAndReturnedForFamilyCardRows() throws Exception {
        // 현대카드 "관계" 컬럼의 본인/가족 값이 저장·조회까지 유지돼야 한다.
        String familyRow = "{\"rowKey\":\"%s\",\"approvedAt\":\"2026-10-01\",\"merchantName\":\"%s\","
                + "\"supplyExVat\":%d,\"vat\":%d,\"grossAmount\":%d,\"cardMasked\":\"4553-****-****-8518\","
                + "\"expenseKind\":\"\",\"subCategory\":\"\",\"businessNo\":\"%s\",\"businessCategory\":\"\","
                + "\"memberRelation\":\"가족\"}";
        String r1 = String.format(familyRow, "f1", "다이소아성산업", 8181, 819, 9000, "2138152063");
        String r2 = String.format(familyRow, "f2", "아트박스용인중앙점", 27183, 2717, 29900, "2148106825");
        String body = "{\"rows\":[" + r1 + "," + r2 + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stored").value(2));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[?(@.rowKey=='f1')].memberRelation").value("가족"))
                .andExpect(jsonPath("$.data[?(@.rowKey=='f2')].memberRelation").value("가족"));
    }

    @Test
    void duplicateImportUpdatesMemberRelationEvenWhenBusinessNoExists() throws Exception {
        // 같은 rowKey로 다시 업로드할 때, business_no가 이미 채워져 있어도
        // member_relation(본인/가족)은 최신 명세서 값으로 갱신돼야 한다.
        String selfRow = "{\"rowKey\":\"2026-10-01|다이소아성산업|9000|819|4553-****-****-8518|매입|#1\","
                + "\"approvedAt\":\"2026-10-01\",\"merchantName\":\"다이소아성산업\","
                + "\"supplyExVat\":8181,\"vat\":819,\"grossAmount\":9000,\"cardMasked\":\"4553-****-****-8518\","
                + "\"expenseKind\":\"\",\"subCategory\":\"\",\"businessNo\":\"2138152063\",\"businessCategory\":\"\","
                + "\"memberRelation\":\"본인\"}";
        String familyRow = "{\"rowKey\":\"2026-10-01|다이소아성산업|9000|819|4553-****-****-8518|매입|#1\","
                + "\"approvedAt\":\"2026-10-01\",\"merchantName\":\"다이소아성산업\","
                + "\"supplyExVat\":8181,\"vat\":819,\"grossAmount\":9000,\"cardMasked\":\"4553-****-****-8518\","
                + "\"expenseKind\":\"\",\"subCategory\":\"\",\"businessNo\":\"2138152063\",\"businessCategory\":\"\","
                + "\"memberRelation\":\"가족\"}";

        String first = "{\"rows\":[" + selfRow + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(first))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stored").value(1));

        String second = "{\"rows\":[" + familyRow + "],\"merchantRules\":{}}";
        mvc.perform(post("/api/v1/assets/card-imports").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stored").value(1));

        mvc.perform(get("/api/v1/assets/card-imports?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].memberRelation").value("가족"));
    }
}
