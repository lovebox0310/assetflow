package com.assetflow.investments.toss;

import java.math.BigDecimal;
import java.util.List;

/**
 * 토스증권 보유자산 스냅샷 (이슈 #55 Stage 2).
 *
 * <p>동기화에 필요한 최소 필드만 담는다. {@code items} 는 항상 비어 있지 않은 리스트
 * 객체를 유지한다(null 금지) — 보유가 없으면 빈 리스트다. 빈 리스트를 "응답 손상"으로
 * 보고 기존 행을 지우면 사용자가 지운 기록이 되살아난다(§31.4 와 같은 함정).</p>
 *
 * @param items                 종목 목록(보유 없으면 빈 리스트)
 * @param totalPurchaseKrw      총 매입금액 중 원화 표기 값
 * @param marketValueKrw        총 평가금액 중 원화 표기 값
 */
public record TossHoldings(List<TossHolding> items,
                           BigDecimal totalPurchaseKrw,
                           BigDecimal marketValueKrw) {

    public TossHoldings {
        items = items == null ? List.of() : List.copyOf(items);
    }
}
