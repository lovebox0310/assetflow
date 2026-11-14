package com.assetflow.investments.bond;

import com.assetflow.investments.kis.KisApiClient;
import com.assetflow.investments.kis.KisCredentials;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.Map;

/**
 * KIS 장내채권 발행정보(CTPF1101R) 조회 (BOND-INFO-1).
 *
 * <p>채권 마스터 검색으로 종목을 찾은 뒤 발행기관·표면이율·신용등급 등을 보강한다.
 * 실패는 예외가 아니라 {@code error} 로 돌려준다 — 진단·보조 정보이므로 저장을 막지 않는다.</p>
 */
@Service
public class BondIssueInfoService {

    public record BondIssueInfo(
            String issuerName,
            BigDecimal couponRate,
            @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd") LocalDate issueDate,
            @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd") LocalDate maturityDate,
            String bondClass,
            String creditRating,
            String error) {}

    private static final String PATH = "/uapi/domestic-bond/v1/quotations/issue-info";
    private static final String TR_ID = "CTPF1101R";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("uuuuMMdd")
            .withResolverStyle(ResolverStyle.STRICT);

    private final KisApiClient kisApiClient;

    public BondIssueInfoService(KisApiClient kisApiClient) {
        this.kisApiClient = kisApiClient;
    }

    public BondIssueInfo fetch(KisCredentials credentials, String pdno) {
        if (pdno == null || pdno.isBlank()) {
            return error("종목번호가 필요합니다");
        }
        try {
            JsonNode root = kisApiClient.get(credentials, PATH,
                    Map.of("PDNO", pdno.trim(), "PRDT_TYPE_CD", "302"), TR_ID);
            JsonNode output = firstNode(root.path("output"));
            if (output == null) {
                return error("KIS 응답에 output 이 없습니다");
            }
            return new BondIssueInfo(
                    textOrNull(output, "issu_istt_name"),
                    decimalOrNull(output, "srfc_inrt"),
                    date(output, "issu_dt"),
                    date(output, "expd_dt"),
                    textOrNull(output, "bond_cls_kor_name"),
                    firstNonBlank(output, "kis_crdt_grad_text", "kbp_crdt_grad_text",
                            "nice_crdt_grad_text", "fnp_crdt_grad_text"),
                    null);
        } catch (RuntimeException e) {
            String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return error("채권 발행정보를 가져오지 못했습니다: " + reason);
        }
    }

    private static BondIssueInfo error(String message) {
        return new BondIssueInfo(null, null, null, null, null, null, message);
    }

    private static JsonNode firstNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        if (node.isArray()) return node.isEmpty() ? null : node.get(0);
        return node.isObject() ? node : null;
    }

    private static String textOrNull(JsonNode node, String field) {
        String value = node.path(field).asText("").trim();
        return value.isEmpty() ? null : value;
    }

    private static BigDecimal decimalOrNull(JsonNode node, String field) {
        String value = node.path(field).asText("").trim();
        if (value.isEmpty()) return null;
        try {
            return new BigDecimal(value.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDate date(JsonNode node, String field) {
        String value = node.path(field).asText("").trim();
        if (value.isEmpty()) return null;
        try {
            return LocalDate.parse(value, DATE);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static String firstNonBlank(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = textOrNull(node, field);
            if (value != null) return value;
        }
        return null;
    }
}
