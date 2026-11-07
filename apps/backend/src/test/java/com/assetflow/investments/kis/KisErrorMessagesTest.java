package com.assetflow.investments.kis;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * §69 KIS 오류 본문 파싱 회귀 테스트.
 *
 * <p>인증 계열은 error_code/error_description, 업무 계열은 msg_cd/msg1 로
 * 오류가 온다. 어느 쪽이든 사유와 코드가 사용자에게 전달돼야 한다 —
 * 상태 텍스트("Forbidden")만 보이면 앱키·계좌·환경 중 무엇이 틀렸는지 알 수 없다.</p>
 */
class KisErrorMessagesTest {

    @Test
    void tokenErrorKeepsReasonCodeAndHint() {
        String message = KisErrorMessages.describe(
                "{\"error_description\":\"서버 에러가 발생했습니다.\",\"error_code\":\"EGW00002\"}");

        assertThat(message).contains("서버 에러가 발생했습니다.");
        assertThat(message).contains("EGW00002");
    }

    /**
     * §69.3 EGW00002 는 앱키 오류가 아니다. 게이트웨이가 앱키·시크릿을 먼저 검증하고
     * (틀리면 EGW00103/EGW00105) 통과한 뒤 토큰 발급에서 실패한 경우라, 사용자에게
     * "키를 다시 확인하라"고 안내하면 같은 키를 반복 입력하게 만든다.
     */
    @Test
    void genericTokenErrorDoesNotBlameTheKey() {
        String message = KisErrorMessages.describe(
                "{\"error_description\":\"서버 에러가 발생했습니다.\",\"error_code\":\"EGW00002\"}");

        assertThat(message).contains("입력 오류가 아닙니다");
        assertThat(message).doesNotContain("키를 다시 확인하세요");
        assertThat(message).contains("API 신청 상태");
    }

    /** 키가 실제로 틀렸을 때는 반대로 키를 확인하라고 안내해야 한다. */
    @Test
    void invalidAppKeyStillBlamesTheKey() {
        String message = KisErrorMessages.describe(
                "{\"error_code\":\"EGW00103\",\"error_description\":\"유효하지 않은 AppKey입니다.\"}");

        assertThat(message).contains("키를 다시 확인하세요");
    }

    @Test
    void businessErrorUsesMsg1() {
        String message = KisErrorMessages.describe(
                "{\"rt_cd\":\"1\",\"msg_cd\":\"EGW02004\","
                        + "\"msg1\":\"실전투자 도메인은 모의투자 앱키로 호출하실 수 없습니다.\"}");

        assertThat(message).contains("실전투자 도메인은 모의투자 앱키로 호출하실 수 없습니다.");
        assertThat(message).contains("EGW02004");
    }

    @Test
    void unknownCodeKeepsRawReasonOnly() {
        String message = KisErrorMessages.describe(
                "{\"error_code\":\"XYZ9999\",\"error_description\":\"알 수 없는 오류\"}");

        assertThat(message).isEqualTo("알 수 없는 오류 (XYZ9999)");
    }

    @Test
    void nonJsonBodyIsIgnored() {
        assertThat(KisErrorMessages.describe("<html>Bad Gateway</html>")).isEmpty();
        assertThat(KisErrorMessages.describe(null)).isEmpty();
    }
}
