package com.assetflow.investments.kis;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

/**
 * §69 KIS 오류 응답을 사용자가 읽을 수 있는 문장으로 바꾼다.
 *
 * <p>KIS 는 엔드포인트마다 오류 필드가 다르다 — 인증 계열은
 * {@code error_code}/{@code error_description}, 업무 계열은
 * {@code msg_cd}/{@code msg1}. 상태 텍스트("Forbidden")만 보여 주면
 * "앱키가 모의투자용" 같은 실제 사유를 알 수 없으므로, 본문을 파싱해
 * 코드와 함께 원문을 붙이고 자주 나오는 코드에는 조치를 덧붙인다.</p>
 */
final class KisErrorMessages {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 코드별 조치 안내. 여기에 없는 코드는 원문만 보여 준다. */
    private static final Map<String, String> HINTS = Map.ofEntries(
            Map.entry("EGW00103", "App Key가 유효하지 않습니다. KIS Developers의 Application에서 키를 다시 확인하세요."),
            Map.entry("EGW00104", "App Secret이 비어 있습니다."),
            Map.entry("EGW00105", "App Secret이 유효하지 않습니다. 키를 다시 발급받아 입력하세요."),
            Map.entry("EGW00115", "grant_type이 누락되었습니다."),
            Map.entry("EGW00133", "접근토큰은 1분에 1회만 발급됩니다. 1분 뒤 다시 시도하세요."),
            Map.entry("EGW00201", "호출 한도를 초과했습니다. 잠시 뒤 다시 시도하세요."),
            Map.entry("EGW00202", "KIS 게이트웨이 라우팅 오류입니다. 잠시 뒤 다시 시도하세요."),
            Map.entry("EGW02004", "모의투자 앱키로 실전 도메인을 호출했습니다. API 환경과 앱키를 같은 것으로 맞추세요."),
            Map.entry("EGW00002", "KIS가 접근토큰 발급을 거부했습니다. KIS Developers의 Application 상태와 "
                    + "이용목적(실전/모의), API 신청 내역을 확인하세요. 실전 계좌라면 실전용 앱키여야 합니다."),
            Map.entry("OPSQ2000", "계좌번호(CANO)·상품코드가 이 앱키에 등록된 계좌와 다릅니다."));

    private KisErrorMessages() {
    }

    /**
     * 오류 응답 본문에서 사유를 뽑는다. 본문이 비었거나 JSON 이 아니면 빈 문자열.
     */
    static String describe(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        JsonNode node;
        try {
            node = MAPPER.readTree(body);
        } catch (Exception ignored) {
            return "";
        }
        String code = firstText(node, "error_code", "msg_cd");
        String reason = firstText(node, "error_description", "msg1");
        if (reason.isEmpty() && code.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append(reason.isEmpty() ? "KIS 오류" : reason);
        if (!code.isEmpty()) {
            sb.append(" (").append(code).append(')');
        }
        String hint = HINTS.get(code);
        if (hint != null) {
            sb.append(" — ").append(hint);
        }
        return sb.toString();
    }

    private static String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = node.path(field).asText("").trim();
            if (!value.isEmpty()) {
                return value;
            }
        }
        return "";
    }
}
