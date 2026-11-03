package com.assetflow.assets.bank;

/**
 * 빠른조회 1회 요청 값.
 *
 * 계좌 비밀번호·생년월일(사업자번호 뒷자리)은 **요청이 끝나면 사라진다** — DB·로그·
 * 응답 어디에도 남기지 않는다(§61). 실수로 로그에 찍히지 않도록 toString 도 가린다.
 */
public record BankQuery(BankCode bankCode,
                        String accountNumber,
                        String accountPassword,
                        String residentNumber,
                        String accountType,
                        String startDate,
                        String endDate) {

    @Override
    public String toString() {
        return "BankQuery[bankCode=" + bankCode
                + ", accountNumber=****"
                + ", accountType=" + accountType
                + ", startDate=" + startDate
                + ", endDate=" + endDate + "]";
    }
}
