package com.assetflow.investments.toss;

/**
 * 토스증권 {@code GET /api/v1/accounts} 응답 1건 (이슈 #55 Stage 2).
 *
 * <p>{@code accountSeq} 는 보유자산 조회의 {@code X-Tossinvest-Account} 헤더 값이다.
 * {@code accountNo} 는 계좌번호이므로 화면·응답에는 {@link #maskedAccountNo()} 로만 내보낸다.</p>
 */
public record TossAccount(String accountNo, Integer accountSeq, String accountType) {

    /** 앞 2자리 + {@code ****}. 원문이 응답에 남지 않게 서버에서 가린다. */
    public String maskedAccountNo() {
        return mask(accountNo);
    }

    static String mask(String accountNo) {
        if (accountNo == null) {
            return "";
        }
        String trimmed = accountNo.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        return trimmed.substring(0, Math.min(2, trimmed.length())) + "****";
    }

    /** 400 안내문에 쓸 후보 표기 — 마스킹된 계좌번호 + 종류 + 식별자. */
    public String candidateLabel() {
        return maskedAccountNo() + "(" + (accountType == null ? "" : accountType)
                + ", seq=" + (accountSeq == null ? "" : accountSeq) + ")";
    }
}
