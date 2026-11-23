package com.assetflow.investments.toss;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이슈 #55: 토스 오류 코드 → 사용자 문구 고정. 토스 문서의 코드를 그대로 쓴다.
 */
class TossErrorMessagesTest {

    @Test
    void ipNotAllowedGuidesIpRegistration() {
        assertThat(TossErrorMessages.message("ip-not-allowed"))
                .isEqualTo("허용 IP 가 등록되지 않았습니다. 토스증권 WTS → 설정 → Open API → "
                        + "허용 IP 관리에서 서버 IP 를 등록하세요.");
    }

    @Test
    void tokenErrorsAskToRetry() {
        String expected = "토스 인증이 만료되었습니다. 다시 시도해 주세요.";
        assertThat(TossErrorMessages.message("invalid-token")).isEqualTo(expected);
        assertThat(TossErrorMessages.message("expired-token")).isEqualTo(expected);
        assertThat(TossErrorMessages.message("token-revoked")).isEqualTo(expected);
    }

    @Test
    void accountNotFoundGuidesAccountSelection() {
        assertThat(TossErrorMessages.message("account-not-found"))
                .isEqualTo("계좌를 찾을 수 없습니다. 계좌 선택을 확인하세요.");
    }

    @Test
    void rateLimitAsksToWait() {
        String expected = "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
        assertThat(TossErrorMessages.message("edge-rate-limit-exceeded")).isEqualTo(expected);
        assertThat(TossErrorMessages.message("rate-limit-exceeded")).isEqualTo(expected);
    }

    @Test
    void unknownCodeFallsBackToGenericMessage() {
        assertThat(TossErrorMessages.message("something-new"))
                .isEqualTo("토스 연동 요청이 실패했습니다. 잠시 후 다시 시도해 주세요.");
        assertThat(TossErrorMessages.message(null))
                .isEqualTo("토스 연동 요청이 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }

    @org.junit.jupiter.api.Test
    void oauthAccessDeniedGuidesIpAndCredentials() {
        // 토큰 발급은 OAuth2 형식({"error":"access_denied"})으로 응답한다 — 허용 IP 미등록이 대표 사유다.
        String message = TossErrorMessages.message("access_denied");
        org.junit.jupiter.api.Assertions.assertTrue(message.contains("허용 IP"), message);
        org.junit.jupiter.api.Assertions.assertTrue(message.contains("Client ID"), message);
    }
}
