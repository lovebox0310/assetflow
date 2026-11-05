package com.assetflow.investments.kis;

import java.math.BigDecimal;
import java.util.List;

/**
 * §62 KIS 국내주식 잔고조회 응답 DTO.
 * 필드명은 KIS API 응답(output1/output2)을 따른다.
 */
public record KisBalanceResponse(
        List<Holding> holdings,
        Summary summary
) {

    public record Holding(
            String pdno,          // 상품번호(종목코드)
            String prdtName,      // 상품명(종목명)
            BigDecimal hldgQty,   // 보유수량
            BigDecimal pchsAvgPric, // 매입평균가격(평단가)
            BigDecimal prpr,      // 현재가
            BigDecimal evluAmt,   // 평가금액
            BigDecimal evalPflsAmt, // 평가손익금액
            String crdtLoanYn     // 신용대출여부
    ) {}

    public record Summary(
            BigDecimal dncaTotAmt,   // 예수금총금액
            BigDecimal totEvluAmt,   // 총평가금액
            BigDecimal sctsEvluAmt,  // 주식평가금액
            BigDecimal thdtBuyAmt,   // 당일매수금액
            BigDecimal thdtSllAmt    // 당일매도금액
    ) {}
}
