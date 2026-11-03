package com.assetflow.assets.bank;

import com.assetflow.assets.AssetAccountController;
import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.investments.InMemoryInvestmentLedger;
import com.assetflow.investments.InvestmentLedger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §61 은행 잔액 동기화 API.
 *
 * 외부 호출은 {@link BankInquiryClient} 대역으로 바꾼다 — 테스트가 실제 은행을
 * 두드리거나 API 키에 의존하지 않는다. 검증 대상은 "어떤 계좌를 허용하는가",
 * "잔액이 자산 원장에 반영되는가", "실패가 표준 오류로 나가는가"다.
 */
class BankSyncApiTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(SECRET).issue("user@example.com");

    private MockMvc mvc;
    private AssetLedger ledger;
    private BankAccountLinkLedger links;
    private final AtomicReference<BankQuery> lastQuery = new AtomicReference<>();
    private final AtomicReference<RuntimeException> failure = new AtomicReference<>();

    @BeforeEach
    void setUp() {
        ledger = new InMemoryAssetLedger();
        links = new InMemoryBankAccountLinkLedger();
        InvestmentLedger investmentLedger = new InMemoryInvestmentLedger();
        BankAccountCipher cipher = new BankAccountCipher("test-bank-link-key", "");

        BankInquiryClient client = query -> {
            lastQuery.set(query);
            RuntimeException injected = failure.get();
            if (injected != null) throw injected;
            return new BankQueryResult(
                    query.accountNumber(),
                    12_345_678L,
                    "파킹통장",
                    "홍길동",
                    List.of(
                            new BankTransaction("2026-11-03", "10:00:00", "스마트출금", "스타벅스",
                                    "스타벅스코리아", 5_000L, 12_345_678L, "withdrawal", "강남", ""),
                            new BankTransaction("2026-11-01", "09:00:00", "FBS입금", "월급",
                                    "회사", 3_000_000L, 12_340_678L, "deposit", "국민", "")),
                    Instant.now());
        };

        BankSyncService service = new BankSyncService(ledger, links, client, cipher);
        mvc = MockMvcBuilders
                .standaloneSetup(
                        new AssetAccountController(ledger, investmentLedger),
                        new BankSyncController(service))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();
    }

    private String linkBody(String bankCode, String accountNumber, String password, String resident) {
        return "{\"bankCode\":\"" + bankCode + "\",\"accountNumber\":\"" + accountNumber
                + "\",\"accountPassword\":\"" + password + "\",\"residentNumber\":\"" + resident
                + "\",\"accountType\":\"personal\"}";
    }

    private String syncBody(String password, String resident) {
        return "{\"accountPassword\":\"" + password + "\",\"residentNumber\":\"" + resident + "\"}";
    }

    @Test
    void unauthenticatedIsBlocked() throws Exception {
        mvc.perform(get("/api/v1/assets/bank-links"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    @Test
    void supportedBanksAreTheFourNoLoginBanks() throws Exception {
        mvc.perform(get("/api/v1/assets/bank/banks").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(4))
                .andExpect(jsonPath("$.data[0].code").value("NH"))
                .andExpect(jsonPath("$.data[3].code").value("IBK"));
    }

    @Test
    void linkUpdatesAssetBalanceAndReturnsMaskedNumber() throws Exception {
        mvc.perform(put("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("WR", "1002-345-678901", "1234", "900101")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sync.balance").value(12_345_678))
                .andExpect(jsonPath("$.data.sync.transactionCount").value(2))
                .andExpect(jsonPath("$.data.sync.latest.date").value("2026-11-03"))
                .andExpect(jsonPath("$.data.link.accountNumberMasked").value("****8901"))
                .andExpect(jsonPath("$.data.link.bankLabel").value("우리은행"));

        // §31.1: 잔액은 자산 원장 한 곳에만 반영된다.
        mvc.perform(get("/api/v1/assets/accounts").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[0].balance").value(12_345_678));

        // 저장된 계좌번호는 마스킹된 형태로만 나간다.
        mvc.perform(get("/api/v1/assets/bank-links").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].accountId").value(1))
                .andExpect(jsonPath("$.data[0].bankCode").value("WR"))
                .andExpect(jsonPath("$.data[0].accountNumberMasked").value("****8901"));

        // 하이픈은 제거하고 숫자만 은행에 보낸다.
        assertEquals("1002345678901", lastQuery.get().accountNumber());
        assertEquals(BankCode.WR, lastQuery.get().bankCode());
        assertEquals(8, lastQuery.get().startDate().length());
        assertEquals(8, lastQuery.get().endDate().length());
    }

    @Test
    void linkRejectsInvestAccount() throws Exception {
        // id 4 = 키움 투자금(invest) — balance 는 예수금이라 은행 잔액으로 덮으면 안 된다.
        mvc.perform(put("/api/v1/assets/accounts/4/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("KB", "123456789012", "1234", "900101")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void linkRejectsDebtAccount() throws Exception {
        // id 7 = 주택담보대출(isDebt) — 부채는 동기화 대상이 아니다.
        mvc.perform(put("/api/v1/assets/accounts/7/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("KB", "123456789012", "1234", "900101")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void linkRejectsUnknownBankAndBadCredentials() throws Exception {
        mvc.perform(put("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("SH", "123456789012", "1234", "900101")))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("KB", "123456789012", "12", "900101")))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("KB", "123456789012", "1234", "90010")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void syncWithoutLinkIs404() throws Exception {
        mvc.perform(post("/api/v1/assets/accounts/2/bank-sync").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(syncBody("1234", "900101")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void syncReusesStoredAccountNumber() throws Exception {
        mvc.perform(put("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("NH", "3021234567890", "1234", "900101")))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/assets/accounts/1/bank-sync").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(syncBody("1234", "900101")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountId").value(1))
                .andExpect(jsonPath("$.data.bankCode").value("NH"))
                .andExpect(jsonPath("$.data.balance").value(12_345_678));

        // 사용자는 계좌번호를 다시 입력하지 않는다 — 복호화한 저장값을 쓴다.
        assertEquals("3021234567890", lastQuery.get().accountNumber());
    }

    @Test
    void unlinkRemovesTheLink() throws Exception {
        mvc.perform(put("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("KB", "123456789012", "1234", "900101")))
                .andExpect(status().isOk());

        mvc.perform(delete("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(1));

        mvc.perform(get("/api/v1/assets/bank-links").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void bankRejectionKeepsBankMessageAndMapsTo400() throws Exception {
        failure.set(new BankApiException("BANK_REJECTED",
                "계좌번호 오류입니다. 계좌번호를 다시 확인해 주세요. (안내코드 01506)"));

        mvc.perform(put("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("KB", "123456789012", "1234", "900101")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BANK_REJECTED"))
                .andExpect(jsonPath("$.message").value(
                        "계좌번호 오류입니다. 계좌번호를 다시 확인해 주세요. (안내코드 01506)"));

        // 실패한 연결은 저장되지 않는다 — 잘못된 계좌번호를 남기지 않는다.
        mvc.perform(get("/api/v1/assets/bank-links").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void cooldownMapsTo429WithRetryHint() throws Exception {
        failure.set(new BankApiException("ACCOUNT_COOLDOWN",
                "동일 계좌는 5분에 1회만 조회할 수 있습니다. 잠시 후 다시 시도해 주세요.", 240L));

        mvc.perform(put("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("KB", "123456789012", "1234", "900101")))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("ACCOUNT_COOLDOWN"))
                .andExpect(jsonPath("$.details").value("retryAfterSec=240"));
    }

    @Test
    void negativeBalanceIsRejectedInsteadOfSilentlyZeroed() throws Exception {
        failure.set(null);
        BankAccountCipher cipher = new BankAccountCipher("test-bank-link-key", "");
        BankInquiryClient negative = query -> new BankQueryResult(
                query.accountNumber(), -1_250_000L, "마이너스통장", "홍길동", List.of(), Instant.now());
        BankSyncService service = new BankSyncService(ledger, links, negative, cipher);
        MockMvc negativeMvc = MockMvcBuilders
                .standaloneSetup(new BankSyncController(service))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();

        negativeMvc.perform(put("/api/v1/assets/accounts/1/bank-link").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkBody("KB", "123456789012", "1234", "900101")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mvc.perform(get("/api/v1/assets/accounts").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[0].balance").value(18_500_000));
        assertTrue(links.all().isEmpty());
    }
}
