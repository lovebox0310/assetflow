package com.assetflow.assets;

import com.assetflow.assets.CardImportController.ImportRequest;
import com.assetflow.assets.CardImportController.ImportRow;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.auth.TokenService;
import com.assetflow.common.web.BearerTokenInterceptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new CardImportController(ledger))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService("test-secret-0123456789-0123456789-0123456789")))
                .build();
    }

    private String row(String rowKey, String date, String merchant, long supply, long vat, long gross) {
        return "{\"rowKey\":\"" + rowKey + "\",\"approvedAt\":\"" + date + "\",\"merchantName\":\"" + merchant
                + "\",\"supplyExVat\":" + supply + ",\"vat\":" + vat + ",\"grossAmount\":" + gross
                + ",\"cardMasked\":\"1234\",\"expenseKind\":\"\"}";
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
                new CardImportLedger.ImportedRow("m1", "2025-01-03", "가맹점A", 1000, 100, 1100, "", ""),
                new CardImportLedger.ImportedRow("m2", "2025-02-05", "가맹점B", 2000, 200, 2200, "", "")));
        mvc.perform(get("/api/v1/assets/card-imports?month=2025-01").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].merchantName").value("가맹점A"));
        mvc.perform(get("/api/v1/assets/card-imports?month=2025/01").header("Authorization", TOKEN))
                .andExpect(status().isBadRequest());
    }
}
