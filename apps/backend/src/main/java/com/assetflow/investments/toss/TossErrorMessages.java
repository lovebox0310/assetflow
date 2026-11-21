package com.assetflow.investments.toss;

import java.util.Map;

/**
 * 토스증권 Open API 오류 코드를 사용자가 읽을 수 있는 문장으로 바꾼다 (이슈 #55).
 *
 * <p>토스 오류 응답의 {@code code} 값을 그대로 받아 매핑한다. 표에 없는 코드는
 * 일반 안내로 대체한다 — 코드 문자열을 화면에 그대로 노출하지 않는다.</p>
 */
final class TossErrorMessages {

    /** 사용자가 바로 할 수 있는 조치를 문장으로 쓴다. */
    private static final Map<String, String> MESSAGES = Map.ofEntries(
            Map.entry("ip-not-allowed",
                    "허용 IP 가 등록되지 않았습니다. 토스증권 WTS → 설정 → Open API → "
                            + "허용 IP 관리에서 서버 IP 를 등록하세요."),
            Map.entry("invalid-token", "토스 인증이 만료되었습니다. 다시 시도해 주세요."),
            Map.entry("expired-token", "토스 인증이 만료되었습니다. 다시 시도해 주세요."),
            Map.entry("token-revoked", "토스 인증이 만료되었습니다. 다시 시도해 주세요."),
            Map.entry("account-not-found", "계좌를 찾을 수 없습니다. 계좌 선택을 확인하세요."),
            Map.entry("edge-rate-limit-exceeded", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."),
            Map.entry("rate-limit-exceeded", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."));

    private static final String FALLBACK = "토스 연동 요청이 실패했습니다. 잠시 후 다시 시도해 주세요.";

    private TossErrorMessages() {
    }

    static String message(String code) {
        String known = code == null ? null : MESSAGES.get(code.trim());
        return known == null ? FALLBACK : known;
    }
}
