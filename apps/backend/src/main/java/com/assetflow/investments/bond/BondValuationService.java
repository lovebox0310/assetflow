package com.assetflow.investments.bond;

import com.assetflow.investments.kis.KisApiClient;
import com.assetflow.investments.kis.KisCredentials;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * KIS 장내채권 평균단가조회(CTPF2005R)로 평가금액을 계산한다 (BOND-VALUE-1).
 *
 * <p>채권 평가액은 수량×현재가가 아니라 <b>액면 × 평가단가 / 10,000</b> 이다.
 * 응답은 일자별 배열이며 <b>가장 최신 {@code evlu_dt}</b> 행을 쓴다. 실패는 예외 대신
 * {@code error} 로 돌려준다 — 보조 정보이므로 저장을 막지 않는다.</p>
 */
@Service
public class BondValuationService {

    public record BondValuation(
            String pdno,
            String name,
            @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd") LocalDate asOf,
            BigDecimal unitPrice,
            long evaluated,
            BigDecimal avgYieldRate,
            BigDecimal kisUnitPrice,
            BigDecimal kbpUnitPrice,
            BigDecimal niceUnitPrice,
            BigDecimal fnpUnitPrice,
            String error) {}

    private static final String PATH = "/uapi/domestic-bond/v1/quotations/avg-unit";
    private static final String TR_ID = "CTPF2005R";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("uuuuMMdd")
            .withResolverStyle(ResolverStyle.STRICT);
    private static final BigDecimal TEN_THOUSAND = new BigDecimal("10000");

    private final KisApiClient kisApiClient;

    public BondValuationService(KisApiClient kisApiClient) {
        this.kisApiClient = kisApiClient;
    }

    public BondValuation fetch(KisCredentials credentials, String pdno, long faceAmount) {
        if (pdno == null || pdno.isBlank()) {
            return error("종목번호가 필요합니다");
        }
        LocalDate today = LocalDate.now();
        try {
            Map<String, String> params = Map.ofEntries(
                    Map.entry("INQR_STRT_DT", today.minusDays(30).format(DateTimeFormatter.BASIC_ISO_DATE)),
                    Map.entry("INQR_END_DT", today.format(DateTimeFormatter.BASIC_ISO_DATE)),
                    Map.entry("PDNO", pdno.trim()),
                    Map.entry("PRDT_TYPE_CD", "302"),
                    Map.entry("VRFC_KIND_CD", "00"),
                    Map.entry("CTX_AREA_NK30", ""),
                    Map.entry("CTX_AREA_FK100", ""));
            JsonNode root = kisApiClient.get(credentials, PATH, params, TR_ID);

            List<JsonNode> rows = rows(root.path("output1"));
            if (rows.isEmpty()) {
                return error("평가단가가 없습니다");
            }
            JsonNode latest = latestRow(rows);
            BigDecimal unitPrice = decimalOrNull(latest, "avg_evlu_unpr");
            if (unitPrice == null || unitPrice.signum() <= 0) {
                return error("평가단가가 없습니다");
            }
            long evaluated = BigDecimal.valueOf(faceAmount)
                    .multiply(unitPrice)
                    .divide(TEN_THOUSAND, 0, RoundingMode.HALF_UP)
                    .longValueExact();

            return new BondValuation(
                    textOrNull(latest, "pdno") != null ? textOrNull(latest, "pdno") : pdno.trim(),
                    textOrNull(latest, "prdt_name"),
                    date(latest, "evlu_dt"),
                    unitPrice,
                    evaluated,
                    decimalOrNull(latest, "avg_evlu_erng_rt"),
                    decimalOrNull(latest, "kis_unpr"),
                    decimalOrNull(latest, "kbp_unpr"),
                    decimalOrNull(latest, "nice_evlu_unpr"),
                    decimalOrNull(latest, "fnp_unpr"),
                    null);
        } catch (RuntimeException e) {
            String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return error("채권 평가단가를 가져오지 못했습니다: " + reason);
        }
    }

    private static BondValuation error(String message) {
        return new BondValuation(null, null, null, null, 0, null, null, null, null, null, message);
    }

    private static List<JsonNode> rows(JsonNode node) {
        List<JsonNode> rows = new ArrayList<>();
        if (node == null || node.isMissingNode() || node.isNull()) return rows;
        if (node.isArray()) {
            node.forEach(rows::add);
        } else if (node.isObject()) {
            rows.add(node);
        }
        return rows;
    }

    /** 유효한 evlu_dt 중 가장 최신 행. 날짜가 모두 깨졌으면 첫 행을 쓴다. */
    private static JsonNode latestRow(List<JsonNode> rows) {
        JsonNode latest = null;
        LocalDate latestDate = null;
        for (JsonNode row : rows) {
            LocalDate date = date(row, "evlu_dt");
            if (date == null) continue;
            if (latestDate == null || date.isAfter(latestDate)) {
                latest = row;
                latestDate = date;
            }
        }
        return latest != null ? latest : rows.get(0);
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
}
