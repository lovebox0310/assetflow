package com.assetflow.investments.toss;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 이슈 #55 Stage 2 {@link HttpTossApiClient} 응답 파싱 — 실제 HTTP 는 호출하지 않는다.
 *
 * <p>OpenAPI JSON 에서 확인한 응답 형태(모든 숫자가 문자열, {@code {result:...}} envelope,
 * {@code {error:{code}}} envelope)를 그대로 넣어 파싱 손실이 없는지 고정한다.</p>
 */
class TossPayloadParsingTest {

    private final HttpTossApiClient client = new HttpTossApiClient(new ObjectMapper(),
            new TossProperties(), new TossTokenCache(), HttpClient.newHttpClient());

    @Test
    void parsesAccountsEnvelope() {
        String body = """
                {"result":[{"accountNo":"12345678901","accountSeq":42,"accountType":"BROKERAGE"}]}
                """;

        List<TossAccount> accounts = client.parseAccounts(body);

        assertThat(accounts).hasSize(1);
        assertThat(accounts.get(0).accountNo()).isEqualTo("12345678901");
        assertThat(accounts.get(0).accountSeq()).isEqualTo(42);
        assertThat(accounts.get(0).accountType()).isEqualTo("BROKERAGE");
        assertThat(accounts.get(0).maskedAccountNo()).isEqualTo("12****");
    }

    @Test
    void parsesHoldingsSpecSample() {
        // OpenAPI 문서의 보유자산 예시 그대로(숫자는 문자열).
        String body = """
                {"result":{
                  "totalPurchaseAmount":{"krw":"6500000","usd":"1553"},
                  "marketValue":{"amount":{"krw":"7200000","usd":"1785"},
                                 "amountAfterCost":{"krw":"7050000","usd":"1748"}},
                  "profitLoss":{"amount":{"krw":"700000","usd":"232"},"rate":"0.1179"},
                  "items":[{
                    "symbol":"005930","name":"삼성전자","marketCountry":"KR","currency":"KRW",
                    "quantity":"100","lastPrice":"72000","averagePurchasePrice":"65000",
                    "marketValue":{"purchaseAmount":"6500000","amount":"7200000",
                                   "amountAfterCost":"7050000"},
                    "profitLoss":{"amount":"700000","rate":"0.1077","rateAfterCost":"0.0846"},
                    "cost":{"commission":"14400","tax":"135600"}}]}}
                """;

        TossHoldings holdings = client.parseHoldings(body);

        assertThat(holdings.totalPurchaseKrw()).isEqualByComparingTo("6500000");
        assertThat(holdings.marketValueKrw()).isEqualByComparingTo("7200000");
        assertThat(holdings.items()).hasSize(1);
        TossHolding item = holdings.items().get(0);
        assertThat(item.symbol()).isEqualTo("005930");
        assertThat(item.name()).isEqualTo("삼성전자");
        assertThat(item.marketCountry()).isEqualTo("KR");
        assertThat(item.currency()).isEqualTo("KRW");
        assertThat(item.quantity()).isEqualByComparingTo("100");
        assertThat(item.lastPrice()).isEqualByComparingTo("72000");
        assertThat(item.averagePurchasePrice()).isEqualByComparingTo("65000");
        // 종목별 marketValue.amount(중첩)를 읽는다 — 총액의 amount 와 혼동하지 않는다.
        assertThat(item.marketValueAmount()).isEqualByComparingTo("7200000");
        assertThat(item.profitLossAmount()).isEqualByComparingTo("700000");
        assertThat(item.profitLossRate()).isEqualByComparingTo("0.1077");
    }

    @Test
    void emptyItemsStaysAnEmptyList() {
        TossHoldings holdings = client.parseHoldings("""
                {"result":{"totalPurchaseAmount":{"krw":"0","usd":"0"},"items":[]}}
                """);

        assertThat(holdings.items()).isEmpty();
        assertThat(holdings.totalPurchaseKrw()).isEqualByComparingTo("0");
        assertThat(holdings.marketValueKrw()).isNull();
    }

    @Test
    void parsesUsdKrwRate() {
        BigDecimal rate = client.parseUsdKrwRate("""
                {"result":{"baseCurrency":"USD","quoteCurrency":"KRW","rate":"1380.5"}}
                """);

        assertThat(rate).isEqualByComparingTo("1380.5");
    }

    @Test
    void rejectsMissingRateInsteadOfReturningZero() {
        assertThatThrownBy(() -> client.parseUsdKrwRate("""
                {"result":{"baseCurrency":"USD","quoteCurrency":"KRW"}}
                """)).isInstanceOf(TossApiException.class);
    }

    @Test
    void readsErrorCodeFromEnvelope() {
        String body = """
                {"error":{"requestId":"r-1","code":"ip-not-allowed",
                          "message":"IP not allowed","data":null}}
                """;

        assertThat(client.errorCode(403, body)).isEqualTo("ip-not-allowed");
        // 형식이 다른 본문은 상태 기반 코드로 대체한다.
        assertThat(client.errorCode(502, "<html>bad gateway</html>")).isEqualTo("http-502");
    }

    @Test
    void readsOAuthErrorStringFromTokenEndpoint() {
        // 토큰 발급은 {"error":"access_denied"} 처럼 error 가 **문자열**이다(문서 명시).
        // 예전 파서는 이 형식을 못 읽어 403 을 http-403 으로 뭉갰다.
        assertThat(client.errorCode(403, "{\"error\":\"access_denied\"}")).isEqualTo("access_denied");
        assertThat(client.errorCode(401, "{\"error\":\"invalid_client\"}")).isEqualTo("invalid_client");
    }

    @Test
    void rejectsInvalidJsonAsApiError() {
        assertThatThrownBy(() -> client.parseHoldings("not-json"))
                .isInstanceOf(TossApiException.class);
        // 빈 본문은 빈 목록으로 둔다 — "손상"으로 단정해 시드를 되살리지 않는다.
        assertThat(client.parseAccounts("")).isEmpty();
    }

    @Test
    void gzipBodyIsNotMistakenForAnApiCode() {
        // 토스는 Accept-Encoding 을 생략해도 gzip 으로 응답한다. 해제하지 못한 본문은
        // JSON 이 아니므로 상태 기반 코드로 떨어진다 — 403 이 http-502 로 보이던 원인.
        // 요청에 Accept-Encoding: identity 를 넣어 이 경로를 피한다(구현 주석 참조).
        assertThat(client.errorCode(403, "\u001f\u008b\u0008garbage")).isEqualTo("http-403");
    }

    @Test
    void parsesExchangeRateFromResult() {
        // 토스 응답: {"result":{"baseCurrency":"USD","quoteCurrency":"KRW","rate":"1380.5",...}}
        String body = """
                {"result":{"baseCurrency":"USD","quoteCurrency":"KRW","rate":"1380.5",
                           "midRate":"1375","basisPoint":"40","rateChangeType":"UP"}}
                """;
        assertThat(client.parseUsdKrwRate(body)).isEqualByComparingTo("1380.5");
    }
}
