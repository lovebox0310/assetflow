package com.assetflow.investments.kis;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * §62 KIS 국내주식 잔고조회 서비스.
 * - endpoint: GET /uapi/domestic-stock/v1/trading/inquire-balance
 * - 모의투자 tr_id: VTTC8434R, 실전 tr_id: TTTC8434R
 * - 계좌번호는 CANO(앞 8자리) + ACNT_PRDT_CD(상품코드, 일반 "01") 로 구성.
 */
@Service
public class KisBalanceService {

    private static final String BALANCE_PATH = "/uapi/domestic-stock/v1/trading/inquire-balance";
    private static final String ACCOUNT_BALANCE_PATH = "/uapi/domestic-stock/v1/trading/inquire-account-balance";
    private static final String MOCK_TR_ID = "VTTC8434R";
    private static final String REAL_TR_ID = "TTTC8434R";
    private static final String ACCOUNT_BALANCE_TR_ID = "CTRP6548R";

    private final KisApiClient kisApiClient;

    public KisBalanceService(KisApiClient kisApiClient) {
        this.kisApiClient = kisApiClient;
    }

    public KisBalanceResponse fetchBalance(KisCredentials credentials) {
        try {
            return fetchStockBalance(credentials);
        } catch (KisApiException primary) {
            // §62 CMA/연금 등 상품코드가 21, 29 등인 계좌는 주식잔고조회가 안 될 수 있다.
            // 투자계좌자산현황조회로 예수금만이라도 동기화한다.
            try {
                return fetchAccountBalance(credentials);
            } catch (KisApiException fallback) {
                throw primary;
            }
        }
    }

    private KisBalanceResponse fetchStockBalance(KisCredentials credentials) {
        Map<String, String> params = Map.ofEntries(
                Map.entry("CANO", normalize(credentials.cano())),
                Map.entry("ACNT_PRDT_CD", normalize(credentials.acntPrdtCd())),
                Map.entry("AFHR_FLPR_YN", "N"),
                Map.entry("OFL_YN", ""),
                Map.entry("INQR_DVSN", "02"),
                Map.entry("UNPR_DVSN", "01"),
                Map.entry("FUND_STTL_ICLD_YN", "N"),
                Map.entry("FNCG_AMT_AUTO_RDPT_YN", "N"),
                Map.entry("PRCS_DVSN", "00"),
                Map.entry("CTX_AREA_FK100", ""),
                Map.entry("CTX_AREA_NK100", ""));
        JsonNode root = kisApiClient.get(credentials, BALANCE_PATH, params, trId(credentials));
        return parse(root);
    }

    private KisBalanceResponse fetchAccountBalance(KisCredentials credentials) {
        Map<String, String> params = Map.ofEntries(
                Map.entry("CANO", normalize(credentials.cano())),
                Map.entry("ACNT_PRDT_CD", normalize(credentials.acntPrdtCd())),
                Map.entry("INQR_DVSN_1", ""),
                Map.entry("BSPR_BF_DT_APLY_YN", ""));
        JsonNode root = kisApiClient.get(credentials, ACCOUNT_BALANCE_PATH, params, ACCOUNT_BALANCE_TR_ID);
        return parseAccountBalance(root);
    }

    private String trId(KisCredentials credentials) {
        return credentials.isMock() ? MOCK_TR_ID : REAL_TR_ID;
    }

    private KisBalanceResponse parse(JsonNode root) {
        List<KisBalanceResponse.Holding> holdings = new ArrayList<>();
        JsonNode output1 = root.path("output1");
        if (output1.isArray()) {
            for (JsonNode node : output1) {
                BigDecimal qty = decimal(node.path("hldg_qty").asText("0"));
                if (qty.compareTo(BigDecimal.ZERO) == 0) {
                    continue;
                }
                holdings.add(new KisBalanceResponse.Holding(
                        text(node, "pdno"),
                        text(node, "prdt_name"),
                        qty,
                        decimal(node.path("pchs_avg_pric").asText("0")),
                        decimal(node.path("prpr").asText("0")),
                        decimal(node.path("evlu_amt").asText("0")),
                        decimal(node.path("evlu_pfls_amt").asText("0")),
                        text(node, "crdt_loan_yn")));
            }
        }
        JsonNode output2 = root.path("output2");
        KisBalanceResponse.Summary summary = null;
        if (output2.isArray() && output2.size() > 0) {
            JsonNode s = output2.get(0);
            summary = new KisBalanceResponse.Summary(
                    decimal(s.path("dnca_tot_amt").asText("0")),
                    decimal(s.path("tot_evlu_amt").asText("0")),
                    decimal(s.path("scts_evlu_amt").asText("0")),
                    decimal(s.path("thdt_buy_amt").asText("0")),
                    decimal(s.path("thdt_sll_amt").asText("0")));
        }
        return new KisBalanceResponse(holdings, summary);
    }

    private KisBalanceResponse parseAccountBalance(JsonNode root) {
        JsonNode output2 = root.path("output2");
        BigDecimal cash = BigDecimal.ZERO;
        if (output2.isObject() && !output2.isMissingNode()) {
            BigDecimal totalDncl = decimal(output2.path("tot_dncl_amt").asText("0"));
            BigDecimal dncl = decimal(output2.path("dncl_amt").asText("0"));
            BigDecimal cma = decimal(output2.path("cma_evlu_amt").asText("0"));
            cash = totalDncl.compareTo(BigDecimal.ZERO) > 0 ? totalDncl
                    : dncl.compareTo(BigDecimal.ZERO) > 0 ? dncl : cma;
        }
        KisBalanceResponse.Summary summary = new KisBalanceResponse.Summary(
                cash, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
        return new KisBalanceResponse(List.of(), summary);
    }

    private static String text(JsonNode node, String field) {
        return node.path(field).asText("").trim();
    }

    private static BigDecimal decimal(String raw) {
        if (raw == null || raw.isBlank()) return BigDecimal.ZERO;
        try {
            return new BigDecimal(raw.replace(",", "").trim());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
