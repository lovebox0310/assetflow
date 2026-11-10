package com.assetflow.investments.upbit;

import java.math.BigDecimal;

/**
 * 업비트 /v1/accounts 응답 1건 (UPBIT-2).
 * 잔고는 balance + locked 로 합산해 쓴다(주문 중 수량 포함).
 */
public record UpbitAccount(String currency, BigDecimal balance, BigDecimal locked,
                           BigDecimal avgBuyPrice, String unitCurrency) {}
