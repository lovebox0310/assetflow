package com.assetflow.investments.kis;

import java.math.BigDecimal;
import java.util.List;

/**
 * §62 KIS 국내주식 잔고조회 응답 DTO.
 * 필드명은 KIS API 응답(output1/output2)을 따른다.
 */
public record KisBalanceResponse(
        List<Holding> holdings,
        Summary summary,
        /** 부분 성공(예: 채권 잔고만 실패) 안내. 없으면 null. */
        String warning
) {

    /** 기존 호출부 호환 — warning=null. */
    public KisBalanceResponse(List<Holding> holdings, Summary summary) {
        this(holdings, summary, null);
    }

    public record Holding(
            String pdno,          // 상품번호(종목코드)
            String prdtName,      // 상품명(종목명)
            BigDecimal hldgQty,   // 보유수량
            BigDecimal pchsAvgPric, // 매입평균가격(평단가)
            BigDecimal prpr,      // 현재가
            BigDecimal evluAmt,   // 평가금액
            BigDecimal evalPflsAmt, // 평가손익금액
            String crdtLoanYn,    // 신용대출여부
            /** stock | etf | bond | fund — 퇴직연금 응답의 item_dvsn_name 으로 판별한다. */
            String assetClass
    ) {
        /** 기존 호출부 호환 — assetClass="stock". */
        public Holding(String pdno, String prdtName, BigDecimal hldgQty, BigDecimal pchsAvgPric,
                       BigDecimal prpr, BigDecimal evluAmt, BigDecimal evalPflsAmt,
                       String crdtLoanYn) {
            this(pdno, prdtName, hldgQty, pchsAvgPric, prpr, evluAmt, evalPflsAmt, crdtLoanYn, "stock");
        }
    }

    /**
     * @param cashKnown 예수금 값을 **신뢰할 수 있는가**. 퇴직연금(IRP, 상품코드 29)
     *                  전용 조회는 예수금 0 도 정상값이므로 true 다. 일반 주식잔고
     *                  경로의 0 은 "읽지 못함"과 구분되지 않아 false 다.
     */
    public record Summary(
            BigDecimal dncaTotAmt,   // 예수금총금액
            BigDecimal totEvluAmt,   // 총평가금액
            BigDecimal sctsEvluAmt,  // 주식평가금액
            BigDecimal thdtBuyAmt,   // 당일매수금액
            BigDecimal thdtSllAmt,   // 당일매도금액
            boolean cashKnown
    ) {
        /** 기존 호출부 호환 — cashKnown=false. */
        public Summary(BigDecimal dncaTotAmt, BigDecimal totEvluAmt, BigDecimal sctsEvluAmt,
                       BigDecimal thdtBuyAmt, BigDecimal thdtSllAmt) {
            this(dncaTotAmt, totEvluAmt, sctsEvluAmt, thdtBuyAmt, thdtSllAmt, false);
        }
    }
}
