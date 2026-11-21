package com.assetflow.investments.toss;

/**
 * 토스증권 API 호출 계약 (이슈 #55 Stage 1).
 *
 * <p>이번 단계에서는 계약만 둔다 — 실제 토큰 발급·계좌 조회 HTTP 구현은
 * Stage 2(보유자산 동기화)에서 붙인다. 구현체는 응답의 오류 코드를
 * {@link TossApiException} 으로 바꿔 던지고, 사용자 문구는
 * {@link TossErrorMessages} 가 만든다.</p>
 */
public interface TossApiClient {

    /**
     * 저장된 자격증명으로 토큰을 발급받아 연결을 확인한다.
     *
     * @throws TossApiException 토스가 오류 코드를 돌려줬을 때
     */
    void verify(TossCredentials credentials);
}
