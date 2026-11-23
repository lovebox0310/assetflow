package com.assetflow.investments.toss;

import java.util.List;

/**
 * 토스증권 API 호출 계약 (이슈 #55 Stage 1 → Stage 2 확장).
 *
 * <p>구현체는 응답의 오류 코드를 {@link TossApiException} 으로 바꿔 던지고, 사용자 문구는
 * {@link TossErrorMessages} 가 만든다. 자격증명·토큰은 어떤 예외 메시지에도 담지 않는다.</p>
 *
 * <p>{@code app.toss.enabled=true} 이면 {@link HttpTossApiClient} 가, 아니면
 * {@link TossApiClientFallback} 이 이 계약을 구현한다(빈 누락으로 부팅이 깨지지 않게).</p>
 */
public interface TossApiClient {

    /**
     * 저장된 자격증명으로 토큰을 발급받아 연결을 확인한다.
     *
     * @throws TossApiException 토스가 오류 코드를 돌려줬을 때
     */
    void verify(TossCredentials credentials);

    /**
     * 계좌 목록. {@code accountSeq} 는 보유자산 조회 헤더 값이다.
     *
     * @throws TossApiException 토스가 오류 코드를 돌려줬을 때
     */
    List<TossAccount> accounts(TossCredentials credentials);

    /**
     * 보유자산. {@code credentials.tossAccountSeq()} 가 없으면 호출할 수 없다
     * (어느 계좌인지 알 수 없으므로 400 계열 {@link IllegalArgumentException}).
     *
     * @throws TossApiException 토스가 오류 코드를 돌려줬을 때
     */
    TossHoldings holdings(TossCredentials credentials);

    /**
     * USD → KRW 환율.
     *
     * @throws TossApiException 토스가 오류 코드를 돌려줬거나 값을 읽지 못했을 때
     */
    java.math.BigDecimal usdKrwRate(TossCredentials credentials);
}
