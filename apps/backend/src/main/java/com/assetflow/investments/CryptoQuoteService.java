package com.assetflow.investments;

import java.util.Optional;

/**
 * 코인 현재가 조회 계약 (업비트 공개 ticker).
 *
 * 보유 잔고·주문은 이 계약의 범위가 아니다 — 공개 시세만 조회하며 API 키가 필요 없다.
 * 실패는 예외가 아니라 empty 로 돌려준다(시세가 없다고 저장값·화면이 막히면 안 된다).
 */
public interface CryptoQuoteService {

    /**
     * 코인 현재가. currency 가 KRW 일 때만 조회한다(업비트 KRW 마켓). 실패는 empty.
     *
     * @param symbol   사용자가 입력한 심볼(BTC, ETH …)
     * @param currency 보유종목 통화. KRW 가 아니면(예: USD) 조회하지 않고 empty.
     */
    Optional<QuoteService.Quote> quote(String symbol, String currency);
}
