package com.assetflow.investments.upbit;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * UPBIT-2 /v1/accounts 응답 파싱. 네트워크 없이 배열/필드 형식만 검증한다.
 */
class UpbitAccountClientTest {

    private final HttpUpbitAccountClient client =
            new HttpUpbitAccountClient(new ObjectMapper(), new UpbitJwt(new ObjectMapper()));

    @Test
    void parsesAccountsArrayWithStringNumbers() {
        String body = """
                [
                  {"currency":"BTC","balance":"0.50000000","locked":"0.00000000",
                   "avg_buy_price":"90000000","avg_buy_price_modified":false,"unit_currency":"KRW"},
                  {"currency":"KRW","balance":"120000","locked":"0","avg_buy_price":"0","unit_currency":"KRW"}
                ]
                """;

        List<UpbitAccount> accounts = client.parseAccounts(body);

        assertThat(accounts).hasSize(2);
        assertThat(accounts.get(0).currency()).isEqualTo("BTC");
        assertThat(accounts.get(0).balance()).isEqualByComparingTo(new BigDecimal("0.5"));
        assertThat(accounts.get(0).locked()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(accounts.get(0).avgBuyPrice()).isEqualByComparingTo(new BigDecimal("90000000"));
        assertThat(accounts.get(0).unitCurrency()).isEqualTo("KRW");
        assertThat(accounts.get(1).currency()).isEqualTo("KRW");
        assertThat(accounts.get(1).balance()).isEqualByComparingTo(new BigDecimal("120000"));
    }

    @Test
    void nonArrayOrEmptyBodyIsEmpty() {
        assertThat(client.parseAccounts("{\"error\":{\"name\":\"jwt_verification\"}}")).isEmpty();
        assertThat(client.parseAccounts("[]")).isEmpty();
        assertThat(client.parseAccounts("")).isEmpty();
        assertThat(client.parseAccounts("not-json")).isEmpty();
    }

    @Test
    void numericJsonValuesAreAccepted() {
        String body = """
                [{"currency":"ETH","balance":1.25,"locked":0.25,"avg_buy_price":3000000,"unit_currency":"KRW"}]
                """;

        List<UpbitAccount> accounts = client.parseAccounts(body);

        assertThat(accounts).hasSize(1);
        assertThat(accounts.get(0).balance()).isEqualByComparingTo(new BigDecimal("1.25"));
        assertThat(accounts.get(0).locked()).isEqualByComparingTo(new BigDecimal("0.25"));
        assertThat(accounts.get(0).avgBuyPrice()).isEqualByComparingTo(new BigDecimal("3000000"));
    }
}
