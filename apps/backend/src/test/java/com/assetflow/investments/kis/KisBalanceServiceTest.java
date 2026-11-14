package com.assetflow.investments.kis;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
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

    private static KisCredentials pensionCredentials() {
        return new KisCredentials(26L, "appkey", "appsecret",
                "https://openapi.koreainvestment.com:9443", "64116780", "29");
    }

    @Test
    void irpUsesPensionApiAndDerivesPriceFromEvaluation() {
        List<String> paths = new ArrayList<>();
        List<String> trIds = new ArrayList<>();
        KisApiClient api = client((path, tr) -> {
            paths.add(path);
            trIds.add(tr);
            if (path.contains("domestic-bond")) {
                return json("{\"rt_cd\":\"0\",\"output\":[]}");
            }
            return json("""
                    {"rt_cd":"0",
                     "output1":[{"pdno":"458730","prdt_name":"TIGER 미국배당다우존스",
                       "hldg_qty":"851","pchs_avg_pric":"14693","evlu_amt":"21615400",
                       "evlu_pfls_amt":"510000"}],
                     "output2":[{"dnca_tot_amt":"76502","tot_evlu_amt":"21691902",
                       "scts_evlu_amt":"21615400"}]}
                    """);
        });

        KisBalanceResponse result = new KisBalanceService(api).fetchBalance(pensionCredentials());

        // IRP(29)는 퇴직연금 전용 + 장내채권 잔고만 호출한다 — 일반 폴백 없음.
        assertThat(paths).containsExactly(
                "/uapi/domestic-stock/v1/trading/pension/inquire-balance",
                "/uapi/domestic-bond/v1/trading/inquire-balance");
        assertThat(trIds).containsExactly("TTTC2208R", "CTSC8407R");
        assertThat(result.summary().dncaTotAmt()).isEqualByComparingTo(new BigDecimal("76502"));
        assertThat(result.summary().totEvluAmt()).isEqualByComparingTo(new BigDecimal("21691902"));
        assertThat(result.summary().cashKnown()).isTrue();
        assertThat(result.holdings()).hasSize(1);
        KisBalanceResponse.Holding holding = result.holdings().get(0);
        assertThat(holding.pdno()).isEqualTo("458730");
        assertThat(holding.hldgQty()).isEqualByComparingTo(new BigDecimal("851"));
        // prpr 없음 → evlu_amt / hldg_qty = 21,615,400 / 851 = 25,400 (4자리 HALF_UP)
        assertThat(holding.prpr()).isEqualByComparingTo(new BigDecimal("25400"));
    }

    @Test
    void irpWithZeroCashIsValidAndDoesNotFallBack() {
        List<String> paths = new ArrayList<>();
        KisApiClient api = client((path, tr) -> {
            paths.add(path);
            if (path.contains("domestic-bond")) {
                return json("{\"rt_cd\":\"0\",\"output\":[]}");
            }
            return json("""
                    {"rt_cd":"0","output1":[],
                     "output2":[{"dnca_tot_amt":"0","tot_evlu_amt":"0","scts_evlu_amt":"0"}]}
                    """);
        });

        KisBalanceResponse result = new KisBalanceService(api).fetchBalance(pensionCredentials());

        assertThat(paths).containsExactly(
                "/uapi/domestic-stock/v1/trading/pension/inquire-balance",
                "/uapi/domestic-bond/v1/trading/inquire-balance");
        assertThat(result.summary().dncaTotAmt()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.summary().cashKnown()).isTrue();
        assertThat(result.holdings()).isEmpty();
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

    private static final String PENSION_ETF_RESPONSE = """
            {"rt_cd":"0",
             "output1":[{"pdno":"458730","prdt_name":"TIGER 미국배당다우존스",
               "hldg_qty":"851","pchs_avg_pric":"14693","evlu_amt":"21615400",
               "evlu_pfls_amt":"510000","item_dvsn_name":"ETF"}],
             "output2":[{"dnca_tot_amt":"76502","tot_evlu_amt":"21691902",
               "scts_evlu_amt":"21615400"}]}
            """;

    private static final String BOND_BALANCE_RESPONSE = """
            {"rt_cd":"0","output":[
              {"pdno":"KR103502GA34","buy_dt":"20260101","buy_sqno":"1","cblc_qty":"100",
               "buy_unpr":"99.5","buy_amt":"995000","exdt":"20360101","ord_psbl_qty":"100"},
              {"pdno":"KR103502GA34","buy_dt":"20260201","buy_sqno":"2","cblc_qty":"50",
               "buy_unpr":"100","buy_amt":"500000","exdt":"20360101","ord_psbl_qty":"50"}]}
            """;

    private static final String BOND_PRICE_RESPONSE = """
            {"rt_cd":"0","output":{"hts_kor_isnm":"국고채 10년","bond_prpr":"100","ernn_rate":"3.5"}}
            """;

    @Test
    void irpMergesBondLotsAndUsesEffectiveUnitPrice() {
        List<String> paths = new ArrayList<>();
        List<String> trIds = new ArrayList<>();
        KisApiClient api = client((path, tr) -> {
            paths.add(path);
            trIds.add(tr);
            if (path.contains("pension/inquire-balance")) return json(PENSION_ETF_RESPONSE);
            if (path.contains("domestic-bond") && path.contains("inquire-balance")) {
                return json(BOND_BALANCE_RESPONSE);
            }
            if (path.contains("domestic-bond") && path.contains("inquire-price")) {
                return json(BOND_PRICE_RESPONSE);
            }
            throw new KisApiException("unexpected call: " + path);
        });

        KisBalanceResponse result = new KisBalanceService(api).fetchBalance(pensionCredentials());

        assertThat(paths).contains("/uapi/domestic-bond/v1/quotations/inquire-price");
        assertThat(trIds).contains("FHKBJ773400C0");
        // ETF 1건 + 채권 lot 2건이 pdno 기준 1건으로 합쳐져 총 2건.
        assertThat(result.holdings()).hasSize(2);
        assertThat(result.holdings().get(0).assetClass()).isEqualTo("etf");

        KisBalanceResponse.Holding bond = result.holdings().stream()
                .filter(h -> "bond".equals(h.assetClass()))
                .findFirst().orElseThrow();
        assertThat(bond.pdno()).isEqualTo("KR103502GA34");
        assertThat(bond.prdtName()).isEqualTo("국고채 10년");
        assertThat(bond.hldgQty()).isEqualByComparingTo(new BigDecimal("150"));
        // 수량가중 매수단가 = (99.5×100 + 100×50) / 150 = 99.6667
        assertThat(bond.pchsAvgPric()).isEqualByComparingTo(new BigDecimal("99.6667"));
        // 유효단가 = (995,000+500,000)/150 × (100/99.6667) = 10,000
        assertThat(bond.prpr()).isEqualByComparingTo(new BigDecimal("10000"));
        assertThat(bond.evluAmt()).isEqualByComparingTo(new BigDecimal("1500000"));
        assertThat(bond.evalPflsAmt()).isEqualByComparingTo(new BigDecimal("5000"));
        // quantity × marketPrice == buy_amt × (bond_prpr / buy_unpr) — lot 가중 평균 기준.
        BigDecimal expectedUnit = new BigDecimal("1495000")
                .multiply(new BigDecimal("100"))
                .divide(new BigDecimal("14950"), 4, RoundingMode.HALF_UP);
        BigDecimal expectedValuation = expectedUnit.multiply(new BigDecimal("150"));
        assertThat(bond.hldgQty().multiply(bond.prpr())).isEqualByComparingTo(expectedValuation);
    }

    @Test
    void bondFailureKeepsPensionHoldingsAndAddsWarning() {
        KisApiClient api = client((path, tr) -> {
            if (path.contains("pension/inquire-balance")) return json(PENSION_ETF_RESPONSE);
            throw new KisApiException("채권 API 거부");
        });

        KisBalanceResponse result = new KisBalanceService(api).fetchBalance(pensionCredentials());

        assertThat(result.holdings()).hasSize(1);
        assertThat(result.holdings().get(0).assetClass()).isEqualTo("etf");
        assertThat(result.warning())
                .contains("채권 잔고를 읽지 못했습니다")
                .contains("채권 API 거부");
        assertThat(result.summary().cashKnown()).isTrue();
    }
}
