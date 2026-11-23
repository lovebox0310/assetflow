package com.assetflow.investments.toss;

import java.math.BigDecimal;

/**
 * 토스증권 {@code GET /api/v1/holdings} 의 종목 1건 (이슈 #55 Stage 2).
 *
 * <p>토스는 모든 숫자를 문자열(BigDecimal)로 준다 — 파싱은 {@link HttpTossApiClient} 가
 * 끝내고 여기에는 숫자만 담는다. 값이 없으면 null 이다(0 으로 채우지 않는다 —
 * "0 을 줬는지, 우리가 0 으로 만들었는지" 구분이 진단에 필요하다).</p>
 *
 * @param symbol               종목 코드(KR: 005930, US: AAPL)
 * @param name                 종목명
 * @param marketCountry        KR | US
 * @param currency             KRW | USD
 * @param quantity             보유 수량
 * @param lastPrice            현재가
 * @param averagePurchasePrice 평균 매입가
 * @param marketValueAmount    평가액(통화 그대로)
 * @param profitLossAmount     평가손익(통화 그대로)
 * @param profitLossRate       수익률(예: 0.1077 = 10.77%)
 */
public record TossHolding(String symbol, String name, String marketCountry, String currency,
                          BigDecimal quantity, BigDecimal lastPrice, BigDecimal averagePurchasePrice,
                          BigDecimal marketValueAmount, BigDecimal profitLossAmount,
                          BigDecimal profitLossRate) {
}
