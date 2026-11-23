package com.assetflow.investments.toss;

import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.investments.InMemoryInvestmentLedger;
import com.assetflow.investments.InvestmentLedger;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import com.assetflow.investments.PortfolioService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 이슈 #55 Stage 2 {@link TossSyncService} 규칙 검증 — 실제 HTTP 없이 fake 클라이언트로만 돈다.
 *
 * <p>고정하는 것: 매핑(수량/평단/현재가/환율), USD 환율 적용·실패 시 fxRate=1 + warning,
 * 계좌 소유/타입 400, 계좌 여러 개 400 + 후보, <b>빈 items 에서 삭제하지 않음</b>.</p>
 */
class TossSyncServiceTest {

    private static final long USER_ID = 1L;
    private static final String CLIENT_ID = "toss-client-id-0001";
    private static final String CLIENT_SECRET = "toss-client-secret-9999";

    /** TossApiClient fake — 응답을 그대로 주입하고 호출 인자를 기록한다. */
    private static final class FakeTossClient implements TossApiClient {
        private final List<TossCredentials> holdingsCalls = new ArrayList<>();
        private List<TossAccount> accounts = List.of();
        private TossHoldings holdings = new TossHoldings(List.of(), null, null);
        private BigDecimal rate = new BigDecimal("1380.5");
        private RuntimeException accountsFailure;
        private RuntimeException holdingsFailure;
        private RuntimeException rateFailure;
        private int rateCalls;

        @Override
        public void verify(TossCredentials credentials) {
            throw new UnsupportedOperationException("not used");
        }

        @Override
        public List<TossAccount> accounts(TossCredentials credentials) {
            if (accountsFailure != null) {
                throw accountsFailure;
            }
            return accounts;
        }

        @Override
        public TossHoldings holdings(TossCredentials credentials) {
            holdingsCalls.add(credentials);
            if (holdingsFailure != null) {
                throw holdingsFailure;
            }
            return holdings;
        }

        @Override
        public BigDecimal usdKrwRate(TossCredentials credentials) {
            rateCalls++;
            if (rateFailure != null) {
                throw rateFailure;
            }
            return rate;
        }
    }

    private InMemoryAssetLedger assets;
    private InMemoryInvestmentLedger holdings;
    private TossCredentialsService credentials;
    private FakeTossClient client;
    private TossSyncService service;

    @BeforeEach
    void setUp() {
        assets = new InMemoryAssetLedger();
        holdings = new InMemoryInvestmentLedger();
        credentials = new TossCredentialsService(new InMemoryTossCredentialsLedger(),
                new CardImportCipher("test-key", null));
        client = new FakeTossClient();
        service = new TossSyncService(credentials, client, assets, holdings,
                new PortfolioService(assets, holdings));
    }

    private long investAccount() {
        return assets.create("invest", "토스증권", "토스증권", 0, false, null).id();
    }

    private void saveCredentials(Long accountId, String seq) {
        credentials.save(USER_ID, new TossCredentials(accountId, CLIENT_ID, CLIENT_SECRET, seq));
    }

    private static TossHolding krHolding(String symbol, String name, String quantity,
                                         String lastPrice, String avgPrice) {
        return new TossHolding(symbol, name, "KR", "KRW", new BigDecimal(quantity),
                new BigDecimal(lastPrice), new BigDecimal(avgPrice), null, null, null);
    }

    @Test
    void mapsHoldingFieldsAndAutoSelectsSingleAccountSeq() {
        long accountId = investAccount();
        // seq 없이 저장 — 계좌가 1개면 자동 선택되어야 한다.
        saveCredentials(accountId, null);
        client.accounts = List.of(new TossAccount("12345678901", 42, "BROKERAGE"));
        client.holdings = new TossHoldings(List.of(
                krHolding("005930", "삼성전자", "100", "72000", "65000")), null, null);

        TossSyncService.SyncResult result = service.sync(USER_ID);

        assertThat(result.accountId()).isEqualTo(accountId);
        assertThat(result.created()).isEqualTo(1);
        assertThat(result.updated()).isZero();
        assertThat(result.skipped()).isZero();
        assertThat(result.warning()).isNull();
        // 자동 선택된 식별자가 보유자산 요청에 실려야 한다.
        assertThat(client.holdingsCalls).hasSize(1);
        assertThat(client.holdingsCalls.get(0).tossAccountSeq()).isEqualTo("42");

        HoldingRow row = holdings.all().stream()
                .filter(r -> r.accountId() == accountId)
                .findFirst().orElseThrow();
        assertThat(row.assetClass()).isEqualTo("stock");
        assertThat(row.symbol()).isEqualTo("005930");
        assertThat(row.name()).isEqualTo("삼성전자");
        assertThat(row.currency()).isEqualTo("KRW");
        assertThat(row.quantity()).isEqualByComparingTo("100");
        assertThat(row.avgPrice()).isEqualByComparingTo("65000");
        assertThat(row.marketPrice()).isEqualByComparingTo("72000");
        assertThat(row.fxRate()).isEqualByComparingTo("1");
        assertThat(row.priceAsOf()).isEqualTo(LocalDate.now(ZoneId.of("Asia/Seoul")).toString());
        // KRW 만 있으면 환율을 부르지 않는다(불필요한 호출로 유량을 쓰지 않는다).
        assertThat(client.rateCalls).isZero();
        // 최신 포트폴리오를 함께 돌려준다.
        assertThat(result.portfolio().holdings()).anySatisfy(row2 ->
                assertThat(row2.symbol()).isEqualTo("005930"));
    }

    @Test
    void appliesUsdExchangeRateToUsdHoldings() {
        long accountId = investAccount();
        saveCredentials(accountId, "42");
        client.rate = new BigDecimal("1380.5");
        client.holdings = new TossHoldings(List.of(
                new TossHolding("AAPL", "애플", "US", "USD", new BigDecimal("10"),
                        new BigDecimal("200"), new BigDecimal("150"), null, null, null)), null, null);

        TossSyncService.SyncResult result = service.sync(USER_ID);

        assertThat(result.created()).isEqualTo(1);
        assertThat(result.warning()).isNull();
        assertThat(client.rateCalls).isEqualTo(1);
        HoldingRow row = holdings.all().stream()
                .filter(r -> "AAPL".equals(r.symbol()) && r.accountId() == accountId)
                .findFirst().orElseThrow();
        assertThat(row.currency()).isEqualTo("USD");
        assertThat(row.fxRate()).isEqualByComparingTo("1380.5");
        assertThat(row.quantity()).isEqualByComparingTo("10");
        assertThat(row.avgPrice()).isEqualByComparingTo("150");
        assertThat(row.marketPrice()).isEqualByComparingTo("200");
    }

    @Test
    void fallsBackToOneToOneRateWithWarningWhenRateFails() {
        long accountId = investAccount();
        saveCredentials(accountId, "42");
        client.rateFailure = new TossApiException("rate-limit-exceeded");
        client.holdings = new TossHoldings(List.of(
                new TossHolding("AAPL", "애플", "US", "USD", new BigDecimal("10"),
                        new BigDecimal("200"), new BigDecimal("150"), null, null, null)), null, null);

        TossSyncService.SyncResult result = service.sync(USER_ID);

        // 예외를 던지지 않고 저장은 계속한다.
        assertThat(result.created()).isEqualTo(1);
        assertThat(result.warning()).isEqualTo(TossSyncService.FX_WARNING);
        HoldingRow row = holdings.all().stream()
                .filter(r -> "AAPL".equals(r.symbol()) && r.accountId() == accountId)
                .findFirst().orElseThrow();
        assertThat(row.fxRate()).isEqualByComparingTo("1");
    }

    @Test
    void rejectsUnknownAccountWithBadRequest() {
        saveCredentials(9999L, "42");

        assertThatThrownBy(() -> service.sync(USER_ID))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("account not found");
        assertThat(client.holdingsCalls).isEmpty();
    }

    @Test
    void rejectsNonInvestAccountWithBadRequest() {
        long cashAccount = assets.all().stream()
                .filter(row -> "cash".equals(row.accountType()))
                .findFirst().orElseThrow().id();
        saveCredentials(cashAccount, "42");

        assertThatThrownBy(() -> service.sync(USER_ID))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("invest");
        assertThat(client.holdingsCalls).isEmpty();
    }

    @Test
    void rejectsBlankSeqWithCandidatesWhenMultipleAccounts() {
        long accountId = investAccount();
        saveCredentials(accountId, null);
        client.accounts = List.of(
                new TossAccount("12345678901", 42, "BROKERAGE"),
                new TossAccount("98765432109", 77, "BROKERAGE"));

        assertThatThrownBy(() -> service.sync(USER_ID))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("여러 개")
                .hasMessageContaining("seq=42")
                .hasMessageContaining("seq=77")
                // 계좌번호 원문이 메시지에 남지 않는다(마스킹만).
                .hasMessageNotContaining("12345678901")
                .hasMessageNotContaining("98765432109");
        assertThat(client.holdingsCalls).isEmpty();
    }

    @Test
    void emptyItemsNeverDeletesExistingHoldings() {
        long accountId = investAccount();
        saveCredentials(accountId, "42");
        holdings.create(new HoldingRow(0, accountId, "stock", "005930", "삼성전자", "KRW",
                new BigDecimal("100"), new BigDecimal("65000"), new BigDecimal("72000"),
                BigDecimal.ONE, "2026-11-20"));
        client.holdings = new TossHoldings(List.of(), null, null);

        TossSyncService.SyncResult result = service.sync(USER_ID);

        assertThat(result.created()).isZero();
        assertThat(result.updated()).isZero();
        assertThat(result.skipped()).isZero();
        // 토스에 없어도 사용자의 기록은 보존된다(삭제 금지).
        assertThat(holdings.all())
                .anySatisfy(row -> {
                    assertThat(row.accountId()).isEqualTo(accountId);
                    assertThat(row.symbol()).isEqualTo("005930");
                });
    }

    @Test
    void secondSyncUpdatesInsteadOfDuplicating() {
        long accountId = investAccount();
        saveCredentials(accountId, "42");
        client.holdings = new TossHoldings(List.of(
                krHolding("005930", "삼성전자", "100", "72000", "65000")), null, null);
        service.sync(USER_ID);

        client.holdings = new TossHoldings(List.of(
                krHolding("005930", "삼성전자", "120", "73000", "66000")), null, null);
        TossSyncService.SyncResult second = service.sync(USER_ID);

        assertThat(second.created()).isZero();
        assertThat(second.updated()).isEqualTo(1);
        assertThat(holdings.all().stream()
                .filter(row -> row.accountId() == accountId).count()).isEqualTo(1);
        assertThat(holdings.all().stream()
                .filter(row -> row.accountId() == accountId)
                .findFirst().orElseThrow().quantity()).isEqualByComparingTo("120");
    }

    @Test
    void previewReturnsHoldingsWithoutWriting() {
        long accountId = investAccount();
        saveCredentials(accountId, "42");
        client.holdings = new TossHoldings(List.of(
                krHolding("005930", "삼성전자", "100", "72000", "65000")), null, null);
        int before = holdings.all().size();

        TossSyncService.TossPreview preview = service.preview(USER_ID, accountId);

        assertThat(preview.error()).isNull();
        assertThat(preview.holdings().items()).hasSize(1);
        assertThat(preview.holdings().items().get(0).symbol()).isEqualTo("005930");
        assertThat(preview.holdings().items().get(0).averagePurchasePrice())
                .isEqualByComparingTo("65000");
        assertThat(holdings.all()).hasSize(before);
    }

    @Test
    void previewReportsApiFailureAsErrorInsteadOfThrowing() {
        long accountId = investAccount();
        saveCredentials(accountId, "42");
        client.holdingsFailure = new TossApiException("ip-not-allowed");

        TossSyncService.TossPreview preview = service.preview(USER_ID, accountId);

        assertThat(preview.holdings()).isNull();
        assertThat(preview.error()).isEqualTo(TossErrorMessages.message("ip-not-allowed"));
    }

    @Test
    void syncRejectsMissingCredentials() {
        assertThatThrownBy(() -> service.sync(USER_ID))
                .isInstanceOf(TossNotConfiguredException.class);
    }

    @Test
    void syncRejectsMissingAccountIdOnCredentials() {
        saveCredentials(null, "42");

        assertThatThrownBy(() -> service.sync(USER_ID))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("계좌");
    }

    @Test
    void syncCountsItemsWithoutSymbolAsSkipped() {
        long accountId = investAccount();
        saveCredentials(accountId, "42");
        client.holdings = new TossHoldings(List.of(
                krHolding("  ", "이름없음", "1", "1000", "1000"),
                krHolding("000660", "SK하이닉스", "0", "120000", "100000")), null, null);

        TossSyncService.SyncResult result = service.sync(USER_ID);

        assertThat(result.created()).isZero();
        assertThat(result.skipped()).isEqualTo(2);
        assertThat(holdings.all().stream()
                .noneMatch(row -> row.accountId() == accountId)).isTrue();
    }
}
