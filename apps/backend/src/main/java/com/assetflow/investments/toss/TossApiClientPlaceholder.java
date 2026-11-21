package com.assetflow.investments.toss;

import org.springframework.stereotype.Component;

/**
 * 토스증권 API 클라이언트의 Stage 1 자리표시자 (이슈 #55).
 *
 * <p>실제 토큰 발급·계좌 조회 HTTP 구현은 Stage 2(보유자산 동기화)에서 이 클래스를
 * 대체한다. 그 전에 연결 테스트를 호출하면 성공을 거짓으로 말하지 않고 503 으로
 * "아직 준비되지 않음"을 알린다.</p>
 */
@Component
public class TossApiClientPlaceholder implements TossApiClient {

    @Override
    public void verify(TossCredentials credentials) {
        throw new TossNotConfiguredException("토스 연결 테스트는 아직 구현되지 않았습니다(Stage 2)");
    }
}
