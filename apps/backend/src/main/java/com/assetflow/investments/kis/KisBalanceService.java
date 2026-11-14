package com.assetflow.investments.kis;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
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
    /** 퇴직연금(IRP, 상품코드 29) 전용 잔고조회 — 일반 주식잔고로는 예수금이 조회되지 않는다. */
    private static final String PENSION_BALANCE_PATH = "/uapi/domestic-stock/v1/trading/pension/inquire-balance";
    private static final String MOCK_TR_ID = "VTTC8434R";
    private static final String REAL_TR_ID = "TTTC8434R";
    private static final String ACCOUNT_BALANCE_TR_ID = "CTRP6548R";
    private static final String PENSION_TR_ID = "TTTC2208R";
    private static final String PENSION_PRODUCT_CODE = "29";
    /** 장내채권 잔고/현재가 — 퇴직연금 잔고(TTTC2208R)에는 채권이 오지 않는다. */
    private static final String BOND_BALANCE_PATH = "/uapi/domestic-bond/v1/trading/inquire-balance";
    private static final String BOND_PRICE_PATH = "/uapi/domestic-bond/v1/quotations/inquire-price";
    private static final String BOND_BALANCE_TR_ID = "CTSC8407R";
    private static final String BOND_PRICE_TR_ID = "FHKBJ773400C0";

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
        KisBalanceResponse base = baseBalance(credentials);
        // IRP(29)는 퇴직연금 잔고에 주식·ETF·ETN 만 온다 — 장내채권은 별도 API 로 합친다.
        if (!PENSION_PRODUCT_CODE.equals(normalize(credentials.acntPrdtCd()))) {
            return base;
        }
        return withBondHoldings(credentials, base);
    }

    private KisBalanceResponse baseBalance(KisCredentials credentials) {
        // 상품코드 29(퇴직연금 IRP)는 전용 API 로만 예수금/보유종목이 조회된다.
        // 성공하면 그대로 쓰고, 실패하면 아래 일반 경로로 폴백한다(22 개인연금 등은 기존 유지).
        if (PENSION_PRODUCT_CODE.equals(normalize(credentials.acntPrdtCd()))) {
            try {
                KisBalanceResponse pension = fetchPensionBalance(credentials);
                if ((pension.summary() != null && pension.summary().cashKnown())
                        || !pension.holdings().isEmpty()) {
                    return pension;
                }
            } catch (KisApiException ignored) {
                // 퇴직연금 조회가 막히면 기존 주식잔고→계좌자산현황 경로로 넘어간다.
            }
        }

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

    /**
     * 퇴직연금(IRP) 잔고조회 — tr_id TTTC2208R.
     * 일반 주식잔고(TTTC8434R)·계좌자산현황(CTRP6548R)으로는 IRP 예수금이 0 으로 온다.
     * 모의투자에는 연금 상품코드가 없으므로 실전 tr_id 만 쓴다.
     */
    private KisBalanceResponse fetchPensionBalance(KisCredentials credentials) {
        Map<String, String> params = Map.ofEntries(
                Map.entry("CANO", normalize(credentials.cano())),
                Map.entry("ACNT_PRDT_CD", normalize(credentials.acntPrdtCd())),
                Map.entry("ACCA_DVSN_CD", "00"),
                Map.entry("INQR_DVSN", "00"),
                Map.entry("CTX_AREA_FK100", ""),
                Map.entry("CTX_AREA_NK100", ""));
        JsonNode root = kisApiClient.get(credentials, PENSION_BALANCE_PATH, params, PENSION_TR_ID);
        return parsePension(root);
    }

    /**
     * 퇴직연금 응답 파싱. output1 보유종목은 현재가(prpr)가 없을 수 있어
     * 평가금액/수량 → 평단가 순으로 대체한다. output2 의 예수금은 0 도 신뢰한다(cashKnown).
     */
    private KisBalanceResponse parsePension(JsonNode root) {
        List<KisBalanceResponse.Holding> holdings = new ArrayList<>();
        JsonNode output1 = root.path("output1");
        if (output1.isArray()) {
            for (JsonNode node : output1) {
                BigDecimal qty = decimal(node.path("hldg_qty").asText("0"));
                if (qty.signum() <= 0) {
                    continue;
                }
                BigDecimal avgPrice = decimal(node.path("pchs_avg_pric").asText("0"));
                BigDecimal evluAmt = decimal(node.path("evlu_amt").asText("0"));
                BigDecimal price = decimal(node.path("prpr").asText("0"));
                if (price.signum() <= 0 && evluAmt.signum() > 0) {
                    price = evluAmt.divide(qty, 4, RoundingMode.HALF_UP);
                }
                if (price.signum() <= 0) {
                    price = avgPrice;
                }
                holdings.add(new KisBalanceResponse.Holding(
                        text(node, "pdno"),
                        text(node, "prdt_name"),
                        qty,
                        avgPrice,
                        price,
                        evluAmt,
                        decimal(node.path("evlu_pfls_amt").asText("0")),
                        text(node, "crdt_loan_yn"),
                        pensionAssetClass(node)));
            }
        }
        JsonNode summaryNode = firstNode(root.path("output2"));
        BigDecimal cash = firstNonZero(summaryNode, CASH_FIELDS);
        KisBalanceResponse.Summary summary = new KisBalanceResponse.Summary(
                cash,
                decimal(text(summaryNode, "tot_evlu_amt")),
                decimal(text(summaryNode, "scts_evlu_amt")),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                true);
        return new KisBalanceResponse(holdings, summary);
    }

    /** 퇴직연금 응답 item_dvsn_name → 앱 자산군. 채권/펀드는 이 응답에 드물게 오지만 매핑해 둔다. */
    private static String pensionAssetClass(JsonNode node) {
        String division = text(node, "item_dvsn_name").toUpperCase(Locale.ROOT);
        if (division.contains("ETF") || division.contains("ETN")) return "etf";
        if (division.contains("채권") || division.contains("BOND")) return "bond";
        if (division.contains("펀드") || division.contains("FUND")) return "fund";
        return "stock";
    }

    /**
     * IRP 퇴직연금 잔고에 없는 장내채권을 별도 조회해 합친다.
     * 채권 조회 실패는 전체 실패가 아니다 — 주식/ETF는 살리고 warning 으로 알린다.
     */
    private KisBalanceResponse withBondHoldings(KisCredentials credentials, KisBalanceResponse base) {
        try {
            List<KisBalanceResponse.Holding> bonds = fetchBondHoldings(credentials);
            if (bonds.isEmpty()) {
                return base;
            }
            List<KisBalanceResponse.Holding> merged = new ArrayList<>(base.holdings());
            merged.addAll(bonds);
            return new KisBalanceResponse(merged, base.summary(), base.warning());
        } catch (KisApiException e) {
            String bondWarning = "채권 잔고를 읽지 못했습니다: " + e.getMessage();
            String warning = base.warning() == null || base.warning().isBlank()
                    ? bondWarning
                    : base.warning() + " | " + bondWarning;
            return new KisBalanceResponse(base.holdings(), base.summary(), warning);
        }
    }

    /**
     * 장내채권 잔고(CTSC8407R) + 채권 현재가(FHKBJ773400C0).
     *
     * <p>KIS 채권 수량은 액면 천원, 단가는 액면 1만원 기준이라 `수량 × 현재가`를 그대로 쓰면
     * 10~100배 오차가 난다. 그래서 앱이 쓰는 "유효단가"를 역산한다.</p>
     * <pre>
     * purchaseUnit = buy_amt / cblc_qty
     * marketPrice  = purchaseUnit × (bond_prpr / buy_unpr)   // 현재가가 있을 때
     * marketPrice  = purchaseUnit                            // 없거나 buy_unpr ≤ 0
     * </pre>
     */
    private List<KisBalanceResponse.Holding> fetchBondHoldings(KisCredentials credentials) {
        Map<String, String> params = Map.ofEntries(
                Map.entry("CANO", normalize(credentials.cano())),
                Map.entry("ACNT_PRDT_CD", normalize(credentials.acntPrdtCd())),
                Map.entry("INQR_CNDT", "00"),
                Map.entry("PDNO", ""),
                Map.entry("BUY_DT", ""),
                Map.entry("CTX_AREA_FK200", ""),
                Map.entry("CTX_AREA_NK200", ""));
        JsonNode root = kisApiClient.get(credentials, BOND_BALANCE_PATH, params, BOND_BALANCE_TR_ID);

        // pdno 기준 lot 집계 — 같은 채권을 여러 번 매수하면 행이 나뉘어 온다.
        Map<String, BondLot> lots = new LinkedHashMap<>();
        JsonNode output = root.path("output");
        if (output.isArray()) {
            for (JsonNode node : output) {
                String pdno = text(node, "pdno");
                if (pdno.isBlank()) continue;
                BigDecimal qty = decimal(node.path("cblc_qty").asText("0"));
                if (qty.signum() <= 0) continue;
                BigDecimal buyAmt = decimal(node.path("buy_amt").asText("0"));
                BigDecimal buyUnpr = decimal(node.path("buy_unpr").asText("0"));
                BondLot lot = lots.computeIfAbsent(pdno, key -> new BondLot());
                lot.qty = lot.qty.add(qty);
                lot.buyAmt = lot.buyAmt.add(buyAmt);
                lot.weightedBuyUnpr = lot.weightedBuyUnpr.add(buyUnpr.multiply(qty));
            }
        }

        List<KisBalanceResponse.Holding> holdings = new ArrayList<>();
        for (Map.Entry<String, BondLot> entry : lots.entrySet()) {
            String pdno = entry.getKey();
            BondLot lot = entry.getValue();
            BigDecimal avgBuyUnpr = lot.weightedBuyUnpr.divide(lot.qty, 4, RoundingMode.HALF_UP);
            BigDecimal purchaseUnit = lot.buyAmt.divide(lot.qty, 4, RoundingMode.HALF_UP);

            String name = pdno;
            BigDecimal bondPrpr = null;
            try {
                JsonNode priceRoot = kisApiClient.get(credentials, BOND_PRICE_PATH, Map.ofEntries(
                        Map.entry("FID_COND_MRKT_DIV_CODE", "B"),
                        Map.entry("FID_INPUT_ISCD", pdno)), BOND_PRICE_TR_ID);
                JsonNode priceNode = firstNode(priceRoot.path("output"));
                String fetchedName = text(priceNode, "hts_kor_isnm");
                if (!fetchedName.isBlank()) name = fetchedName;
                BigDecimal price = decimal(text(priceNode, "bond_prpr"));
                if (price.signum() > 0) bondPrpr = price;
            } catch (KisApiException ignored) {
                // 현재가가 없어도 잔고는 살린다 — 매수 평가단가를 그대로 쓴다.
            }

            // purchaseUnit × (bond_prpr / avgBuyUnpr) 를 중간 반올림 없이 한 번에 계산한다.
            // (buy_amt × bond_prpr) / Σ(buy_unpr × qty) — lot 가중 평균을 그대로 쓴다.
            BigDecimal marketPrice = purchaseUnit;
            if (bondPrpr != null && lot.weightedBuyUnpr.signum() > 0) {
                marketPrice = lot.buyAmt.multiply(bondPrpr)
                        .divide(lot.weightedBuyUnpr, 4, RoundingMode.HALF_UP);
            }
            BigDecimal evluAmt = marketPrice.multiply(lot.qty);
            BigDecimal evalPflsAmt = evluAmt.subtract(lot.buyAmt);
            holdings.add(new KisBalanceResponse.Holding(
                    pdno, name, lot.qty, avgBuyUnpr, marketPrice, evluAmt, evalPflsAmt, "", "bond"));
        }
        return holdings;
    }

    /** pdno 기준 lot 누적(수량·매수금액·수량가중 매수단가 분자). */
    private static final class BondLot {
        private BigDecimal qty = BigDecimal.ZERO;
        private BigDecimal buyAmt = BigDecimal.ZERO;
        private BigDecimal weightedBuyUnpr = BigDecimal.ZERO;
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
