package com.assetflow.investments.kis;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * §62 KIS 국내주식 잔고조회 서비스.
 * - endpoint: GET /uapi/domestic-stock/v1/trading/inquire-balance
 * - 모의투자 tr_id: VTTC8434R, 실전 tr_id: TTTC8434R
 * - 계좌번호는 CANO(앞 8자리) + ACNT_PRDT_CD(상품코드, 일반 "01") 로 구성.
 *
 * <p>CMA·IRP(상품코드 29) 계좌는 주식잔고조회의 {@code dnca_tot_amt} 가
 * 0 이거나 아예 조회가 안 된다. 이때 투자계좌자산현황조회로 예수금을 다시 읽는다.
 * "성공했지만 예수금이 0" 도 실패로 보고 폴백해야 한다 — 그대로 두면 컨트롤러가
 * 기존 잔액을 0 으로 덮어쓴다(§62.3).</p>
 *
 * <p>개인연금(22)은 예외다 — 주식잔고로 정상 조회되므로 위탁계좌와 같은 순서를 쓰고,
 * 그 경로가 예수금을 못 읽었을 때만 퇴직연금 잔고조회(TTTC2208R)를 마지막으로 시도한다.</p>
 */
@Service
public class KisBalanceService {

    private static final String BALANCE_PATH = "/uapi/domestic-stock/v1/trading/inquire-balance";
    private static final String ACCOUNT_BALANCE_PATH = "/uapi/domestic-stock/v1/trading/inquire-account-balance";
    /**
     * 퇴직연금 잔고조회 — 29(IRP)의 기본 경로이고, 22(개인연금)에서는 마지막 수단이다.
     * 22 는 위탁계좌처럼 주식잔고(TTTC8434R) → 계좌자산현황(CTRP6548R)으로 읽고,
     * 두 경로가 예수금을 못 읽었을 때만 이 API 를 시도한다(§62.3).
     */
    private static final String PENSION_BALANCE_PATH = "/uapi/domestic-stock/v1/trading/pension/inquire-balance";
    private static final String MOCK_TR_ID = "VTTC8434R";
    private static final String REAL_TR_ID = "TTTC8434R";
    private static final String ACCOUNT_BALANCE_TR_ID = "CTRP6548R";
    private static final String PENSION_TR_ID = "TTTC2208R";
    /** 퇴직연금 체결기준잔고 — 보험·국민주택·국고채까지 전체 상품을 포함한다. */
    private static final String PENSION_PRESENT_PATH =
            "/uapi/domestic-stock/v1/trading/pension/inquire-present-balance";
    private static final String PENSION_PRESENT_TR_ID = "TTTC2202R";
    private static final String PENSION_PRODUCT_CODE = "29";
    /** 개인연금 — 주식잔고 → 계좌자산현황이 정상 경로이고, 퇴직연금 잔고조회는 최후 수단이다. */
    private static final String PERSONAL_PENSION_PRODUCT_CODE = "22";
    /** 개인연금(22)을 표준 경로가 아닌 퇴직연금 잔고조회로 읽었을 때 남기는 안내. */
    private static final String PERSONAL_PENSION_FALLBACK_WARNING =
            "개인연금 계좌를 퇴직연금 잔고조회로 읽었습니다";
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

    /**
     * 진단 응답에서 **가릴** 식별 필드 — 계좌번호·고객ID·주민번호류만.
     * 금액({@code dnca_tot_amt}·{@code tot_evlu_amt})과 종목코드·수량은 진단 목적이므로
     * 그대로 둔다(§126). 마스킹은 서버에서 한다 — 클라이언트에 원문을 보내지 않는다.
     */
    private static final Set<String> IDENTIFIER_FIELDS = Set.of(
            "cano", "acnt_no", "acnt_no10", "acnt_no50",
            "cust_id", "cust_rn", "prsn_rn", "rrno");

    /**
     * 유량 제한·일시 장애 문구. 진단 응답의 error/msg 에 이 문구가 섞이면
     * 화면이 "일시적 오류일 수 있습니다" 를 띄운다(§119 — 같은 진단에서 경로별로 갈린다).
     */
    private static final String[] TRANSIENT_MARKERS = {
            "MCI전송", "MCI 전송", "EGW00201", "초당 거래건수", "유량", "잠시 뒤 다시"
    };

    /**
     * 퇴직연금(TTTC2208R) output2 에서 "응답이 실제로 왔다"를 판정하는 키.
     * 기존 {@link #CASH_FIELDS} + 총평가·주식평가·당일매수/매도. 값이 0 이어도 키가 있으면 신뢰한다.
     * 하나도 없으면 output2 가 {@code {}} / {@code []} 인 경우다 — 그건 "정상 0원" 이 아니라
     * "읽지 못함" 이다(§62.3).
     */
    private static final String[] PENSION_KNOWN_FIELDS = {
            "dnca_tot_amt", "prvs_rcdl_excc_amt", "cma_evlu_amt",
            "tot_evlu_amt", "scts_evlu_amt", "thdt_buy_amt", "thdt_sll_amt",
            "tot_dncl_amt", "dncl_amt", "nxdy_excc_amt"
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
        Selected base = selectBalance(credentials, null);
        // IRP(29)는 퇴직연금 잔고에 주식·ETF·ETN 만 온다 — 장내채권은 별도 API 로 합친다.
        if (!PENSION_PRODUCT_CODE.equals(normalize(credentials.acntPrdtCd()))) {
            return base.response();
        }
        return withPensionExtras(credentials, base.response());
    }

    /**
     * 잔고 선택 결과 — 진단(previewPension)이 "동기화가 어느 경로를 쓰는지" 보여 주기 위해
     * 경로 이름을 함께 돌려준다. 경로 규칙은 {@link #fetchBalance} 와 <b>같은 코드</b>다.
     */
    private record Selected(String path, KisBalanceResponse response) {}

    /**
     * 경로 1건 원본 호출 결과 — 진단(previewPension)과 경로 선택(selectBalance)이
     * <b>같은 응답</b>을 쓴다. 예전에는 진단이 3경로를 부른 뒤 selectBalance 가 같은 경로를
     * 다시 불러(최대 6회) 유량 제한으로 {@code MCI전송 오류} 가 섞여 보였다(§119).
     */
    private record PathRaw(String label, String path, String trId,
                           JsonNode response, RuntimeException error) {}

    /** 경로 1건 원본 호출 — 실패해도 던지지 않고 error 에 담는다(진단·선택 공용). */
    private PathRaw fetchPathRaw(KisCredentials credentials, String label, String path,
                                 Map<String, String> params, String trId) {
        try {
            return new PathRaw(label, path, trId,
                    kisApiClient.get(credentials, path, params, trId), null);
        } catch (RuntimeException e) {
            return new PathRaw(label, path, trId, null, e);
        }
    }

    /** 원본 응답 — 실패였으면 그 예외를 그대로 다시 던진다(동기화 경로의 기존 동작 유지). */
    private static JsonNode rawResponse(PathRaw raw) {
        if (raw.error() != null) {
            if (raw.error() instanceof KisApiException api) {
                throw api;
            }
            throw raw.error();
        }
        return raw.response();
    }

    /** 이미 받은 응답이 있으면 재사용하고, 없으면 이때 부른다(동기화 경로는 지연 조회). */
    private static PathRaw prefetchedOrNull(Map<String, PathRaw> prefetched, String key) {
        return prefetched == null ? null : prefetched.get(key);
    }

    private PathRaw stockPathRaw(KisCredentials credentials, Map<String, PathRaw> prefetched) {
        PathRaw raw = prefetchedOrNull(prefetched, "stock");
        return raw != null ? raw : fetchPathRaw(credentials, "주식잔고조회", BALANCE_PATH,
                stockBalanceParams(credentials), trId(credentials));
    }

    private PathRaw accountPathRaw(KisCredentials credentials, Map<String, PathRaw> prefetched) {
        PathRaw raw = prefetchedOrNull(prefetched, "account");
        return raw != null ? raw : fetchPathRaw(credentials, "계좌자산현황조회", ACCOUNT_BALANCE_PATH,
                accountBalanceParams(credentials), ACCOUNT_BALANCE_TR_ID);
    }

    private PathRaw pensionPathRaw(KisCredentials credentials, Map<String, PathRaw> prefetched) {
        PathRaw raw = prefetchedOrNull(prefetched, "pension");
        return raw != null ? raw : fetchPathRaw(credentials, "퇴직연금 잔고조회", PENSION_BALANCE_PATH,
                pensionBalanceParams(credentials), PENSION_TR_ID);
    }

    private KisBalanceResponse stockBalance(KisCredentials credentials, Map<String, PathRaw> prefetched) {
        return parse(rawResponse(stockPathRaw(credentials, prefetched)));
    }

    private KisBalanceResponse accountBalance(KisCredentials credentials, Map<String, PathRaw> prefetched) {
        return parseAccountBalance(rawResponse(accountPathRaw(credentials, prefetched)));
    }

    private KisBalanceResponse pensionBalance(KisCredentials credentials, Map<String, PathRaw> prefetched) {
        return parsePension(rawResponse(pensionPathRaw(credentials, prefetched)));
    }

    /**
     * 경로 선택. {@code prefetched} 가 null 이면 필요한 경로만 그때그때 KIS 로 부른다(동기화).
     * 진단은 3경로 원본을 이미 받았으므로 같은 응답을 넘겨 <b>재호출 없이</b> 같은 판정을 한다.
     */
    private Selected selectBalance(KisCredentials credentials, Map<String, PathRaw> prefetched) {
        String productCode = normalize(credentials.acntPrdtCd());
        // 29(IRP)만 퇴직연금 전용 API(TTTC2208R)를 먼저 쓴다 — 기존 동작.
        // 22(개인연금)는 위탁계좌와 같은 주식잔고 → 계좌자산현황 경로가 정상이고,
        // 연금 API 는 그 경로가 예수금을 못 읽었을 때만 마지막으로 시도한다(§62.3).
        String pensionError = null;
        if (PENSION_PRODUCT_CODE.equals(productCode)) {
            try {
                KisBalanceResponse pension = pensionBalance(credentials, prefetched);
                if (isUsablePensionBalance(pension)) {
                    return new Selected("pension", pension);
                }
                pensionError = "보유종목·예수금이 비어 있습니다";
            } catch (KisApiException e) {
                pensionError = e.getMessage();
            }
            // 모의투자(vps)에는 연금 TR 이 없다 — 폴백해 봐야 위탁계좌 전용 오류만 쌓인다.
            if (credentials.isMock()) {
                throw new KisApiException(mockPensionMessage(pensionError));
            }
        }

        KisBalanceResponse primary = null;
        KisApiException primaryError = null;
        try {
            primary = stockBalance(credentials, prefetched);
        } catch (KisApiException e) {
            primaryError = e;
        }
        if (primary != null && hasCash(primary)) {
            return new Selected("stock", primary);
        }

        KisBalanceResponse fallback = null;
        KisApiException fallbackError = null;
        try {
            fallback = accountBalance(credentials, prefetched);
        } catch (KisApiException e) {
            fallbackError = e;
        }
        if (fallback != null && hasCash(fallback)) {
            return new Selected("account", fallback);
        }

        // 개인연금(22) — 위탁 경로 두 개가 모두 예수금을 못 읽었을 때만 연금 TR 을 마지막으로 시도한다.
        if (PERSONAL_PENSION_PRODUCT_CODE.equals(productCode)) {
            return new Selected("pension", personalPensionLastResort(credentials, productCode,
                    prefetched, primary, primaryError, fallback, fallbackError));
        }

        if (primaryError != null) {
            if (fallbackError != null) {
                String message = "주식잔고조회: " + primaryError.getMessage()
                        + " | 계좌자산현황조회: " + fallbackError.getMessage();
                if (pensionError != null) {
                    // 연금 계좌는 "왜 폴백이 전부 막혔는지"까지 한 줄에 보여 준다.
                    message = "상품코드 " + productCode + "(" + pensionLabel(productCode)
                            + "): 퇴직연금 잔고조회 실패(" + pensionError + ") | " + message;
                }
                throw new KisApiException(message);
            }
            throw primaryError;
        }
        // 조회 자체는 성공했지만 예수금이 0 — 보유종목은 살리고 컨트롤러가
        // "예수금 미확인" 으로 판단할 수 있게 한다. null 은 돌려주지 않는다.
        if (primary != null) return new Selected("stock", primary);
        if (fallback != null) return new Selected("account", fallback);
        return new Selected("unknown", new KisBalanceResponse(List.of(), null));
    }

    /**
     * 개인연금(22) 최후 수단 — 주식잔고(TTTC8434R)·계좌자산현황(CTRP6548R)이 모두
     * 예수금을 주지 못했을 때만 퇴직연금 잔고조회(TTTC2208R)를 시도한다.
     *
     * <p>표준 경로가 아니므로 성공해도 warning 을 남긴다(컨트롤러가 부분 성공으로 보고
     * 보유종목 삭제를 건너뛴다). 빈 연금 응답은 성공이 아니라 세 경로 사유를 합친 예외다.</p>
     */
    private KisBalanceResponse personalPensionLastResort(
            KisCredentials credentials, String productCode, Map<String, PathRaw> prefetched,
            KisBalanceResponse primary, KisApiException primaryError,
            KisBalanceResponse fallback, KisApiException fallbackError) {
        String stockReason = failureReason(primary, primaryError);
        String accountReason = failureReason(fallback, fallbackError);
        // 모의투자에는 연금 TR 이 없다 — 시도 전에 멈추고 안내한다.
        if (credentials.isMock()) {
            throw new KisApiException(mockPensionMessage(
                    "주식잔고조회: " + stockReason + " | 계좌자산현황조회: " + accountReason));
        }

        String pensionReason;
        try {
            KisBalanceResponse pension = pensionBalance(credentials, prefetched);
            if (isUsablePensionBalance(pension)) {
                return new KisBalanceResponse(pension.holdings(), pension.summary(),
                        PERSONAL_PENSION_FALLBACK_WARNING);
            }
            pensionReason = "보유종목·예수금이 비어 있습니다";
        } catch (KisApiException e) {
            pensionReason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        }
        throw new KisApiException("상품코드 " + productCode + "(" + pensionLabel(productCode) + "): "
                + "주식잔고조회 실패(" + stockReason + ")"
                + " | 계좌자산현황조회 실패(" + accountReason + ")"
                + " | 퇴직연금 잔고조회 실패(" + pensionReason + ")");
    }

    /** 모의투자 연금 계좌 안내 — 29·22 가 같은 문구를 쓴다. */
    private static String mockPensionMessage(String reason) {
        return "모의투자(vps)에는 연금 계좌 API가 없습니다. 실전 도메인과 실전 앱키로 설정하세요. "
                + "(연금 조회: " + reason + ")";
    }

    /** 실패 사유 한 줄 — 예외가 있으면 그 메시지, 성공했지만 예수금이 없으면 그 사실. */
    private static String failureReason(KisBalanceResponse response, KisApiException error) {
        if (error != null) {
            return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        }
        return response == null ? "응답 없음" : "예수금 미확인(0원)";
    }

    /** 연금 응답을 그대로 쓸 수 있는가 — known summary 이거나 보유종목이 있으면 성공. */
    private static boolean isUsablePensionBalance(KisBalanceResponse pension) {
        return pension != null
                && ((pension.summary() != null && pension.summary().cashKnown())
                || !pension.holdings().isEmpty());
    }

    /**
     * 연금 상품코드(29 IRP · 22 개인연금) 여부 — 진단(previewPension)에서 TTTC2208R 대상인지 판별한다.
     * 잔고 동기화 경로는 29·22 를 다르게 다루므로 이 술어를 쓰지 않는다.
     */
    private static boolean isPensionAccount(String productCode) {
        return PENSION_PRODUCT_CODE.equals(productCode)
                || PERSONAL_PENSION_PRODUCT_CODE.equals(productCode);
    }

    private static String pensionLabel(String productCode) {
        return PENSION_PRODUCT_CODE.equals(productCode) ? "퇴직연금(IRP)" : "개인연금";
    }

    private static boolean hasCash(KisBalanceResponse response) {
        return response != null
                && response.summary() != null
                && response.summary().dncaTotAmt() != null
                && response.summary().dncaTotAmt().compareTo(BigDecimal.ZERO) > 0;
    }

    /** TTTC8434R 파라미터 — 잔고 조회와 진단(previewPension)이 같은 값을 쓴다. */
    private static Map<String, String> stockBalanceParams(KisCredentials credentials) {
        return Map.ofEntries(
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
    }

    /** CTRP6548R 파라미터 — 잔고 조회와 진단(previewPension)이 같은 값을 쓴다. */
    private static Map<String, String> accountBalanceParams(KisCredentials credentials) {
        return Map.ofEntries(
                Map.entry("CANO", normalize(credentials.cano())),
                Map.entry("ACNT_PRDT_CD", normalize(credentials.acntPrdtCd())),
                Map.entry("INQR_DVSN_1", ""),
                Map.entry("BSPR_BF_DT_APLY_YN", ""));
    }

    /**
     * TTTC2208R 파라미터 — 잔고 조회와 진단(previewPension)이 같은 값을 쓴다.
     * 일반 주식잔고(TTTC8434R)·계좌자산현황(CTRP6548R)으로는 IRP 예수금이 0 으로 온다.
     * 모의투자에는 연금 상품코드가 없으므로 실전 tr_id 만 쓴다.
     */
    private static Map<String, String> pensionBalanceParams(KisCredentials credentials) {
        return Map.ofEntries(
                Map.entry("CANO", normalize(credentials.cano())),
                Map.entry("ACNT_PRDT_CD", normalize(credentials.acntPrdtCd())),
                Map.entry("ACCA_DVSN_CD", "00"),
                Map.entry("INQR_DVSN", "00"),
                Map.entry("CTX_AREA_FK100", ""),
                Map.entry("CTX_AREA_NK100", ""));
    }

    /**
     * 퇴직연금 응답 파싱. output1 보유종목은 현재가(prpr)가 없을 수 있어
     * 평가금액/수량 → 평단가 순으로 대체한다.
     *
     * <p>output2 가 {@code {}} / {@code []} 이거나 아는 키가 하나도 없으면 <b>예외</b>다.
     * "성공했지만 0원" 으로 넘기면 컨트롤러가 정상 완료로 보고 KIS 출처 보유종목을
     * 삭제한다 — 실제로 개인연금(22) 계좌에서 stale 행이 지워졌다(§62.3).</p>
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
        if (!hasPensionSummary(summaryNode)) {
            throw new KisApiException("연금 잔고 응답이 비어 있습니다(상품코드/계좌 유형 확인)");
        }
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

    /** output2 에 아는 키가 값과 함께 하나라도 있는가 — 0 도 값이다. */
    private static boolean hasPensionSummary(JsonNode summaryNode) {
        if (summaryNode == null) {
            return false;
        }
        for (String field : PENSION_KNOWN_FIELDS) {
            JsonNode value = summaryNode.get(field);
            if (value != null && !value.isNull() && !value.asText("").isBlank()) {
                return true;
            }
        }
        return false;
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
     * IRP(29) 보유 전체를 합친다.
     *
     * <p>우선순위: <b>TTTC2202R(체결기준잔고) &gt; TTTC2208R(기존 퇴직연금) &gt; 장내채권(CTSC8407R)</b>.
     * 같은 key(pdno, 없으면 name)는 우선순위가 높은 행만 남긴다. TTTC2202R 은 보험·국민주택·
     * 국고채까지 포함하지만, 혹시 누락된 장내채권을 위해 채권 조회는 fallback 으로 유지한다.
     * 실패는 전체 실패가 아니다 — 각각 warning 문자열로 합친다.</p>
     */
    private KisBalanceResponse withPensionExtras(KisCredentials credentials, KisBalanceResponse base) {
        List<String> warnings = new ArrayList<>();
        if (base.warning() != null && !base.warning().isBlank()) {
            warnings.add(base.warning());
        }

        List<KisBalanceResponse.Holding> present = List.of();
        try {
            present = fetchPensionPresentHoldings(credentials);
        } catch (KisApiException e) {
            warnings.add("퇴직연금 체결기준잔고를 읽지 못했습니다: " + e.getMessage());
        }

        List<KisBalanceResponse.Holding> bonds = List.of();
        try {
            bonds = fetchBondHoldings(credentials);
        } catch (KisApiException e) {
            warnings.add("채권 잔고를 읽지 못했습니다: " + e.getMessage());
        }

        Map<String, KisBalanceResponse.Holding> merged = new LinkedHashMap<>();
        for (KisBalanceResponse.Holding holding : present) {
            merged.putIfAbsent(holdingKey(holding), holding);
        }
        for (KisBalanceResponse.Holding holding : base.holdings()) {
            merged.putIfAbsent(holdingKey(holding), holding);
        }
        for (KisBalanceResponse.Holding holding : bonds) {
            merged.putIfAbsent(holdingKey(holding), holding);
        }
        String warning = warnings.isEmpty() ? null : String.join(" | ", warnings);
        return new KisBalanceResponse(new ArrayList<>(merged.values()), base.summary(), warning);
    }

    /** 중복 제거 key — pdno(없으면 상품명). */
    private static String holdingKey(KisBalanceResponse.Holding holding) {
        String pdno = holding.pdno() == null ? "" : holding.pdno().trim();
        if (!pdno.isEmpty()) return pdno;
        String name = holding.prdtName() == null ? "" : holding.prdtName().trim();
        return name;
    }

    /**
     * 퇴직연금 체결기준잔고(TTTC2202R) — 보험·국민주택·국고채까지 전체 보유.
     * output2 의 예수금은 신뢰하지 않는다(필드가 없을 수 있음) — 예수금은 TTTC2208R 값을 유지한다.
     */
    private List<KisBalanceResponse.Holding> fetchPensionPresentHoldings(KisCredentials credentials) {
        JsonNode root = kisApiClient.get(credentials, PENSION_PRESENT_PATH,
                pensionPresentParams(credentials), PENSION_PRESENT_TR_ID);

        List<KisBalanceResponse.Holding> holdings = new ArrayList<>();
        JsonNode output1 = root.path("output1");
        if (output1.isArray()) {
            for (JsonNode node : output1) {
                BigDecimal evluAmt = decimal(node.path("evlu_amt").asText("0"));
                BigDecimal pchsAmt = decimal(node.path("pchs_amt").asText("0"));
                BigDecimal qty = decimal(node.path("hldg_qty").asText("0"));
                // 보험처럼 수량이 0 으로 오지만 평가액이 있는 상품은 1주로 본다.
                if (qty.signum() <= 0 && evluAmt.signum() > 0) {
                    qty = BigDecimal.ONE;
                }
                if (qty.signum() <= 0) {
                    continue; // 수량·평가액 모두 없으면 진짜 빈 행이다.
                }

                BigDecimal price = decimal(node.path("prpr").asText("0"));
                // 보험·채권은 prpr 가 0/없음 — 평가액 ÷ 수량으로 현재가를 역산한다.
                if (price.signum() <= 0 && evluAmt.signum() > 0) {
                    price = evluAmt.divide(qty, 4, RoundingMode.HALF_UP);
                }

                BigDecimal avgPrice = decimal(node.path("pchs_avg_pric").asText("0"));
                if (avgPrice.signum() <= 0 && pchsAmt.signum() > 0) {
                    avgPrice = pchsAmt.divide(qty, 4, RoundingMode.HALF_UP);
                }
                if (avgPrice.signum() <= 0) {
                    avgPrice = price;
                }

                holdings.add(new KisBalanceResponse.Holding(
                        text(node, "pdno"),
                        text(node, "prdt_name"),
                        qty,
                        avgPrice,
                        price,
                        evluAmt,
                        decimal(node.path("evlu_pfls_amt").asText("0")),
                        "",
                        presentAssetClass(node)));
            }
        }
        return holdings;
    }

    /** 체결기준잔고의 잔고구분명/상품명으로 자산군을 정한다. 보험·국민주택·국고는 bond. */
    private static String presentAssetClass(JsonNode node) {
        String division = (text(node, "cblc_dvsn_name") + " " + text(node, "prdt_name"))
                .toUpperCase(Locale.ROOT);
        if (division.contains("ETF") || division.contains("ETN")) return "etf";
        if (division.contains("채권") || division.contains("보험") || division.contains("국고")
                || division.contains("국민주택") || division.contains("BOND")
                || division.contains("INSURANCE")) {
            return "bond";
        }
        if (division.contains("펀드") || division.contains("FUND")) return "fund";
        return "stock";
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
        JsonNode root = kisApiClient.get(credentials, BOND_BALANCE_PATH,
                bondBalanceParams(credentials), BOND_BALANCE_TR_ID);

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
                JsonNode priceRoot = kisApiClient.get(credentials, BOND_PRICE_PATH,
                        bondPriceParams(pdno), BOND_PRICE_TR_ID);
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

    /** 진단용 원본 1건 — 변환/저장 없이 KIS JSON 을 그대로 보여 준다. */
    public record BondPricePreview(String pdno, JsonNode price, String error) {}

    /**
     * 진단용 채권/퇴직연금 원본 묶음. balance 가 null 이면 error 에 잔고 조회 사유가 들어 있다.
     * pensionPresent 는 TTTC2202R(체결기준잔고) 원본이며, 실패하면 null + error 문구가 붙는다.
     */
    public record BondPreview(JsonNode balance, List<BondPricePreview> prices, String error,
                              JsonNode pensionPresent) {}

    /**
     * IRP 채권 원본 진단 (읽기 전용, DB 변경 없음).
     *
     * <p>잔고는 있으나 변환 결과가 비어 보일 때, 실제 KIS 응답(잔고/현재가)을 그대로
     * 확인하기 위한 경로다. 잔고 조회 실패는 예외 대신 {@code error} 로 돌려준다(진단 목적).
     * 현재가는 잔고의 중복 없는 pdno 마다 1회 조회하고, 개별 실패는 그 항목의 error 에 담는다.</p>
     */
    public BondPreview previewBonds(KisCredentials credentials) {
        JsonNode balance;
        try {
            balance = kisApiClient.get(credentials, BOND_BALANCE_PATH,
                    bondBalanceParams(credentials), BOND_BALANCE_TR_ID);
        } catch (RuntimeException e) {
            return new BondPreview(null, List.of(), e.getMessage(), null);
        }

        // TTTC2202R(체결기준잔고) 원본도 함께 — 보험/국민주택/국고채 포함 여부를 눈으로 확인한다.
        JsonNode pensionPresent = null;
        String presentError = null;
        try {
            pensionPresent = kisApiClient.get(credentials, PENSION_PRESENT_PATH,
                    pensionPresentParams(credentials), PENSION_PRESENT_TR_ID);
        } catch (RuntimeException e) {
            presentError = "퇴직연금 체결기준잔고를 읽지 못했습니다: " + e.getMessage();
        }

        List<BondPricePreview> prices = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        JsonNode output = balance.path("output");
        if (output.isArray()) {
            for (JsonNode node : output) {
                String pdno = text(node, "pdno");
                if (pdno.isBlank() || !seen.add(pdno)) {
                    continue;
                }
                try {
                    JsonNode price = kisApiClient.get(credentials, BOND_PRICE_PATH,
                            bondPriceParams(pdno), BOND_PRICE_TR_ID);
                    prices.add(new BondPricePreview(pdno, price, null));
                } catch (RuntimeException e) {
                    prices.add(new BondPricePreview(pdno, null, e.getMessage()));
                }
            }
        }
        return new BondPreview(balance, prices, presentError, pensionPresent);
    }

    /**
     * 진단용 경로 1건 — 어느 엔드포인트(tr_id)를 어떤 파라미터로 불렀고, 원본 JSON 또는
     * 실패 사유가 무엇인지 그대로 담는다. 응답 변환·저장은 하지 않는다.
     */
    public record PathPreview(String path, String trId, JsonNode response, String error) {}

    /**
     * 동기화가 실제로 고른 경로의 요약 — {@code path} 는 {@code stock·account·pension·unknown}.
     * {@code cash} 가 null 이면 예수금을 읽지 못한 것이다(0 과 구분).
     */
    public record BalancePreview(String path, Long cash, int holdingCount,
                                 String warning, String error) {}

    /**
     * 개인연금(22)/IRP(29) 퇴직연금 잔고(TTTC2208R) 원본 + 세 경로 원본 진단.
     * balance 는 pension.response() 와 같은 데이터다(기존 계약 유지 — 중복 허용).
     *
     * <p>계좌번호·고객ID·주민번호류는 <b>서버에서</b> 마스킹해 내려간다(원문 없음).
     * 금액·종목코드·{@code rt_cd}/{@code msg_cd}/{@code msg1} 은 진단에 필요하므로 그대로 둔다.</p>
     *
     * @param usedPath    동기화({@link #fetchBalance})가 쓸 경로: stock·account·pension·unknown
     * @param transientError 유량 제한·일시 장애 문구({@code MCI전송 오류} 등)가 섞였는가
     */
    public record PensionPreview(JsonNode balance, String warning, String error,
                                 String acntPrdtCd,
                                 @JsonProperty("isMock") boolean isMock,
                                 PathPreview stock, PathPreview account, PathPreview pension,
                                 String usedPath, BalancePreview balancePreview,
                                 @JsonProperty("transient") boolean transientError) {

        /** 자격증명 누락처럼 진단 자체를 못 한 응답용 — transient 는 항상 false. */
        public PensionPreview(JsonNode balance, String warning, String error, String acntPrdtCd,
                              boolean isMock, PathPreview stock, PathPreview account,
                              PathPreview pension, String usedPath, BalancePreview balancePreview) {
            this(balance, warning, error, acntPrdtCd, isMock, stock, account, pension,
                    usedPath, balancePreview, false);
        }
    }

    /**
     * 퇴직연금/연금 잔고 원본 진단 (읽기 전용, DB 변경 없음).
     *
     * <p>개인연금(22) 응답이 비어 오는 사례에서 "KIS 가 0 을 보냈는지, 우리 파싱이 0 으로
     * 만드는지"를 구분하기 위해 <b>주식잔고(TTTC8434R)·계좌자산현황(CTRP6548R)·퇴직연금
     * (TTTC2208R)</b> 세 경로를 각각 <b>한 번씩</b> 호출해 원본을 돌려준다. 한 경로가 실패해도
     * 예외를 전파하지 않고 그 경로의 error 에만 담는다.</p>
     *
     * <p>경로 선택(usedPath)은 그 세 응답을 <b>재사용</b>한다 — 다시 부르면 진단 1회가 6회
     * 호출이 되어 유량 제한({@code MCI전송 오류})이 섞여 보였다(§119).</p>
     */
    public PensionPreview previewPension(KisCredentials credentials) {
        String productCode = normalize(credentials.acntPrdtCd());
        String warning = isPensionAccount(productCode) ? null
                : "상품코드 " + (productCode.isBlank() ? "(없음)" : productCode)
                        + " 는 연금 계좌(22/29)가 아닙니다 — 응답이 비어 있을 수 있습니다";

        // 3경로 원본 — 각 1회. 아래 selectBalance 가 이 응답으로 경로를 판정한다.
        PathRaw stockRaw = stockPathRaw(credentials, null);
        PathRaw accountRaw = accountPathRaw(credentials, null);
        PathRaw pensionRaw = pensionPathRaw(credentials, null);
        Map<String, PathRaw> prefetched = Map.of(
                "stock", stockRaw, "account", accountRaw, "pension", pensionRaw);

        // balance 는 기존 계약 그대로 퇴직연금 원본이다.
        JsonNode rawBalance = pensionRaw.response();
        String error = pathErrorMessage(pensionRaw);
        if (rawBalance != null && !hasPensionSummary(firstNode(rawBalance.path("output2")))) {
            String empty = "output2 가 비어 있습니다 — 동기화는 예수금 '알 수 없음' 으로 처리합니다"
                    + "(보유종목 삭제 없음)";
            warning = warning == null ? empty : warning + " | " + empty;
        }

        // 동기화가 실제로 고를 경로·요약 — fetchBalance 와 같은 선택 코드를, 이미 받은 응답으로 돌린다.
        BalancePreview balancePreview;
        try {
            Selected selected = selectBalance(credentials, prefetched);
            KisBalanceResponse response = PENSION_PRODUCT_CODE.equals(productCode)
                    ? withPensionExtras(credentials, selected.response())
                    : selected.response();
            Long cash = response.summary() == null || response.summary().dncaTotAmt() == null
                    ? null : response.summary().dncaTotAmt().longValue();
            balancePreview = new BalancePreview(selected.path(), cash, response.holdings().size(),
                    response.warning(), null);
        } catch (RuntimeException e) {
            String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            balancePreview = new BalancePreview("unknown", null, 0, null, reason);
        }

        // 계좌번호·고객ID·주민번호류는 서버에서 가린다 — 클라이언트는 원문을 받지 않는다.
        String accountNumber = normalize(credentials.cano());
        PathPreview stock = maskedPreview(stockRaw, accountNumber);
        PathPreview account = maskedPreview(accountRaw, accountNumber);
        PathPreview pension = maskedPreview(pensionRaw, accountNumber);
        JsonNode balance = pension.response();

        boolean transientError = isTransient(stockRaw) || isTransient(accountRaw)
                || isTransient(pensionRaw)
                || isTransientText(balancePreview.error())
                || isTransientText(balancePreview.warning())
                || isTransientText(warning);

        return new PensionPreview(balance, warning, error, productCode, credentials.isMock(),
                stock, account, pension, balancePreview.path(), balancePreview, transientError);
    }

    /** 경로 1건의 실패 사유 — 진단 화면 문구 규칙(성공이면 null). */
    private static String pathErrorMessage(PathRaw raw) {
        if (raw.error() == null) {
            return null;
        }
        String reason = raw.error().getMessage() == null
                ? raw.error().getClass().getSimpleName() : raw.error().getMessage();
        return raw.label() + "를 읽지 못했습니다: " + reason;
    }

    /** 진단용 경로 1건 — 원본은 마스킹해서 내려간다. */
    private static PathPreview maskedPreview(PathRaw raw, String accountNumber) {
        return new PathPreview(raw.path(), raw.trId(),
                maskIdentifiers(raw.response(), accountNumber), pathErrorMessage(raw));
    }

    /**
     * 식별 정보 마스킹 — 계좌번호·고객ID·주민번호류 <b>필드 값</b>과, 문자열 안에 섞여 온
     * 계좌번호를 앞 2자리만 남기고 가린다. 금액·종목코드·응답코드는 건드리지 않는다.
     */
    private static JsonNode maskIdentifiers(JsonNode node, String accountNumber) {
        if (node == null) {
            return null;
        }
        if (node.isObject()) {
            ObjectNode masked = JsonNodeFactory.instance.objectNode();
            node.properties().forEach(entry -> {
                JsonNode value = entry.getValue();
                if (isIdentifierField(entry.getKey()) && value.isValueNode() && !value.isNull()) {
                    masked.put(entry.getKey(), maskValue(value.asText()));
                } else {
                    masked.set(entry.getKey(), maskIdentifiers(value, accountNumber));
                }
            });
            return masked;
        }
        if (node.isArray()) {
            ArrayNode masked = JsonNodeFactory.instance.arrayNode();
            for (JsonNode child : node) {
                masked.add(maskIdentifiers(child, accountNumber));
            }
            return masked;
        }
        if (node.isTextual() && accountNumber.length() >= 4 && node.asText().contains(accountNumber)) {
            return TextNode.valueOf(node.asText().replace(accountNumber, maskValue(accountNumber)));
        }
        return node.deepCopy();
    }

    private static boolean isIdentifierField(String field) {
        return IDENTIFIER_FIELDS.contains(field.toLowerCase(Locale.ROOT));
    }

    /** 앞 2자리만 남기고 나머지는 **** — 되돌릴 수 없고, 눈으로 계좌를 특정하기도 어렵다. */
    private static String maskValue(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            return value;
        }
        return value.length() <= 2 ? "****" : value.substring(0, 2) + "****";
    }

    /** 경로 응답이 유량/일시 오류였는가 — 예외 문구와 본문 {@code msg1} 을 함께 본다. */
    private static boolean isTransient(PathRaw raw) {
        return (raw.error() != null && isTransientText(raw.error().getMessage()))
                || isTransientText(text(raw.response(), "msg1"));
    }

    private static boolean isTransientText(String text) {
        if (text == null || text.isBlank()) {
            return false;
        }
        for (String marker : TRANSIENT_MARKERS) {
            if (text.contains(marker)) {
                return true;
            }
        }
        return false;
    }

    private static Map<String, String> pensionPresentParams(KisCredentials credentials) {
        return Map.ofEntries(
                Map.entry("CANO", normalize(credentials.cano())),
                Map.entry("ACNT_PRDT_CD", normalize(credentials.acntPrdtCd())),
                Map.entry("USER_DVSN_CD", "00"),
                Map.entry("CTX_AREA_FK100", ""),
                Map.entry("CTX_AREA_NK100", ""));
    }

    private static Map<String, String> bondBalanceParams(KisCredentials credentials) {
        return Map.ofEntries(
                Map.entry("CANO", normalize(credentials.cano())),
                Map.entry("ACNT_PRDT_CD", normalize(credentials.acntPrdtCd())),
                Map.entry("INQR_CNDT", "00"),
                Map.entry("PDNO", ""),
                Map.entry("BUY_DT", ""),
                Map.entry("CTX_AREA_FK200", ""),
                Map.entry("CTX_AREA_NK200", ""));
    }

    private static Map<String, String> bondPriceParams(String pdno) {
        return Map.ofEntries(
                Map.entry("FID_COND_MRKT_DIV_CODE", "B"),
                Map.entry("FID_INPUT_ISCD", pdno));
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
