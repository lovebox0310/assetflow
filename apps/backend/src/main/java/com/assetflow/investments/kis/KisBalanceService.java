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
 *
 * <p>CMA·연금 계좌(상품코드 21/29 등)는 주식잔고조회의 {@code dnca_tot_amt} 가
 * 0 이거나 아예 조회가 안 된다. 이때 투자계좌자산현황조회로 예수금을 다시 읽는다.
 * "성공했지만 예수금이 0" 도 실패로 보고 폴백해야 한다 — 그대로 두면 컨트롤러가
 * 기존 잔액을 0 으로 덮어쓴다(§62.3).</p>
 */
@Service
public class KisBalanceService {

    private static final String BALANCE_PATH = "/uapi/domestic-stock/v1/trading/inquire-balance";
    private static final String ACCOUNT_BALANCE_PATH = "/uapi/domestic-stock/v1/trading/inquire-account-balance";
    private static final String MOCK_TR_ID = "VTTC8434R";
    private static final String REAL_TR_ID = "TTTC8434R";
    private static final String ACCOUNT_BALANCE_TR_ID = "CTRP6548R";

    /** 예수금 후보 필드 — 계좌 종류에 따라 KIS 가 다른 필드에 넣어 준다. */
    private static final String[] CASH_FIELDS = {
            "tot_dncl_amt", "dncl_amt", "cma_evlu_amt", "dnca_tot_amt",
            "prvs_rcdl_excc_amt", "nxdy_excc_amt"
    };

    private final KisApiClient kisApiClient;

    public KisBalanceService(KisApiClient kisApiClient) {
        this.kisApiClient = kisApiClient;
    }

    /**
     * 주식잔고 → (예수금이 없거나 조회 실패 시) 계좌자산현황 순서로 읽는다.
     * 둘 다 실패하면 **두 사유를 함께** 던진다 — 어느 쪽이 막혔는지 알아야
     * 사용자가 앱키/계좌번호/API 환경을 고칠 수 있다.
     */
    public KisBalanceResponse fetchBalance(KisCredentials credentials) {
        KisBalanceResponse primary = null;
        KisApiException primaryError = null;
        try {
            primary = fetchStockBalance(credentials);
        } catch (KisApiException e) {
            primaryError = e;
        }
        if (primary != null && hasCash(primary)) {
            return primary;
        }

        KisBalanceResponse fallback = null;
        KisApiException fallbackError = null;
        try {
            fallback = fetchAccountBalance(credentials);
        } catch (KisApiException e) {
            fallbackError = e;
        }
        if (fallback != null && hasCash(fallback)) {
            return fallback;
        }

        if (primaryError != null) {
            if (fallbackError != null) {
                throw new KisApiException("주식잔고조회: " + primaryError.getMessage()
                        + " | 계좌자산현황조회: " + fallbackError.getMessage());
            }
            throw primaryError;
        }
        // 조회 자체는 성공했지만 예수금이 0 — 보유종목은 살리고 컨트롤러가
        // "예수금 미확인" 으로 판단할 수 있게 한다. null 은 돌려주지 않는다.
        if (primary != null) return primary;
        if (fallback != null) return fallback;
        return new KisBalanceResponse(List.of(), null);
    }

    private static boolean hasCash(KisBalanceResponse response) {
        return response != null
                && response.summary() != null
                && response.summary().dncaTotAmt() != null
                && response.summary().dncaTotAmt().compareTo(BigDecimal.ZERO) > 0;
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
        JsonNode summaryNode = firstNode(root.path("output2"));
        // 주식잔고조회의 dnca_tot_amt 가 0 인 CMA 계좌도 다른 예수금 필드에
        // 값이 있을 수 있으므로 후보를 훑는다. 없으면 0(미확인)으로 둔다.
        BigDecimal cash = firstNonZero(summaryNode, CASH_FIELDS);
        KisBalanceResponse.Summary summary = new KisBalanceResponse.Summary(
                cash,
                decimal(text(summaryNode, "tot_evlu_amt")),
                decimal(text(summaryNode, "scts_evlu_amt")),
                decimal(text(summaryNode, "thdt_buy_amt")),
                decimal(text(summaryNode, "thdt_sll_amt")));
        return new KisBalanceResponse(holdings, summary);
    }

    private KisBalanceResponse parseAccountBalance(JsonNode root) {
        JsonNode summaryNode = firstNode(root.path("output2"));
        BigDecimal cash = firstNonZero(summaryNode, CASH_FIELDS);
        KisBalanceResponse.Summary summary = new KisBalanceResponse.Summary(
                cash, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
        return new KisBalanceResponse(List.of(), summary);
    }

    /** output2 는 KIS 버전/엔드포인트에 따라 배열 또는 객체로 온다 — 둘 다 받는다. */
    private static JsonNode firstNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.isArray()) {
            return node.isEmpty() ? null : node.get(0);
        }
        return node.isObject() ? node : null;
    }

    private static BigDecimal firstNonZero(JsonNode node, String... fields) {
        if (node == null) {
            return BigDecimal.ZERO;
        }
        for (String field : fields) {
            BigDecimal value = decimal(text(node, field));
            if (value.compareTo(BigDecimal.ZERO) > 0) {
                return value;
            }
        }
        return BigDecimal.ZERO;
    }

    private static String text(JsonNode node, String field) {
        return node == null ? "" : node.path(field).asText("").trim();
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
