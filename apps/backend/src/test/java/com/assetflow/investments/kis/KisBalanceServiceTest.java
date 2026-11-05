package com.assetflow.investments.kis;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;
import java.util.function.BiFunction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * §62.3 KIS 예수금 폴백 회귀 테스트.
 *
 * <p>CMA 계좌는 주식잔고조회의 dnca_tot_amt 가 0 이거나 조회 자체가 막힌다.
 * 그때 계좌자산현황조회로 예수금을 다시 읽어야 하고, 두 조회가 모두 실패하면
 * **양쪽 사유**를 사용자에게 보여 줄 수 있어야 한다.</p>
 */
class KisBalanceServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final KisCredentials credentials = new KisCredentials(
            17L, "appkey", "appsecret", "https://openapivts.koreainvestment.com:29443",
            "64116780", "21");

    private static KisApiClient client(BiFunction<String, String, JsonNode> response) {
        return new KisApiClient() {
            @Override
            public JsonNode get(KisCredentials c, String path, Map<String, String> params, String trId) {
                return response.apply(path, trId);
            }

            @Override
            public JsonNode post(KisCredentials c, String path, Map<String, String> params,
                                 Object body, String trId) {
                throw new UnsupportedOperationException();
            }
        };
    }

    private static JsonNode json(String body) {
        try {
            return MAPPER.readTree(body);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void primaryCashIsUsedWithoutFallback() {
        int[] calls = {0};
        KisApiClient api = client((path, tr) -> {
            calls[0]++;
            return json("""
                    {"rt_cd":"0","output1":[],"output2":[{"dnca_tot_amt":"2500000"}]}
                    """);
        });

        KisBalanceResponse result = new KisBalanceService(api).fetchBalance(credentials);

        assertThat(result.summary().dncaTotAmt()).isEqualByComparingTo(new BigDecimal("2500000"));
        assertThat(calls[0]).isEqualTo(1);
    }

    @Test
    void zeroPrimaryCashFallsBackToAccountBalance() {
        int[] accountCalls = {0};
        KisApiClient api = client((path, tr) -> {
            if (path.contains("inquire-account-balance")) {
                accountCalls[0]++;
                // output2 가 배열로 와도 읽어야 한다.
                return json("""
                        {"rt_cd":"0","output2":[{"tot_dncl_amt":"0","dncl_amt":"0","cma_evlu_amt":"8800000"}]}
                        """);
            }
            return json("""
                    {"rt_cd":"0","output1":[],"output2":[{"dnca_tot_amt":"0"}]}
                    """);
        });

        KisBalanceResponse result = new KisBalanceService(api).fetchBalance(credentials);

        assertThat(accountCalls[0]).isEqualTo(1);
        assertThat(result.summary().dncaTotAmt()).isEqualByComparingTo(new BigDecimal("8800000"));
    }

    @Test
    void failingPrimaryUsesAccountBalance() {
        KisApiClient api = client((path, tr) -> {
            if (path.contains("inquire-account-balance")) {
                return json("""
                        {"rt_cd":"0","output2":{"dncl_amt":"1234567"}}
                        """);
            }
            throw new KisApiException("모의투자 처리계좌의 ID와 사용자정보가 상이");
        });

        KisBalanceResponse result = new KisBalanceService(api).fetchBalance(credentials);

        assertThat(result.summary().dncaTotAmt()).isEqualByComparingTo(new BigDecimal("1234567"));
    }

    @Test
    void bothFailuresAreReportedTogether() {
        KisApiClient api = client((path, tr) -> {
            throw new KisApiException(path.contains("inquire-account-balance")
                    ? "계좌자산현황 거부" : "주식잔고 거부");
        });

        assertThatThrownBy(() -> new KisBalanceService(api).fetchBalance(credentials))
                .isInstanceOf(KisApiException.class)
                .hasMessageContaining("주식잔고 거부")
                .hasMessageContaining("계좌자산현황 거부");
    }

    @Test
    void successfulPrimaryWithZeroCashIsKeptWhenFallbackAlsoHasNone() {
        KisApiClient api = client((path, tr) -> json("""
                {"rt_cd":"0","output1":[{"pdno":"005930","prdt_name":"삼성전자","hldg_qty":"10",
                 "pchs_avg_pric":"70000","prpr":"75000","evlu_amt":"750000","evlu_pfls_amt":"50000"}],
                 "output2":[{"dnca_tot_amt":"0"}]}
                """));

        KisBalanceResponse result = new KisBalanceService(api).fetchBalance(credentials);

        assertThat(result.holdings()).hasSize(1);
        assertThat(result.summary().dncaTotAmt()).isEqualByComparingTo(BigDecimal.ZERO);
    }
}
