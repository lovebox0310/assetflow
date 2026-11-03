package com.assetflow.assets.bank;

/**
 * 은행 조회 실패. HTTP 상태가 아니라 **code 로 분기**한다(§61).
 *
 * bankapi.co.kr 는 은행이 거절해도 HTTP 200 + success:false 로 답하므로
 * 상태 코드만 보면 성공으로 오인한다. code 는 API 가 준 값을 그대로 보존하고,
 * 화면에는 message 를 그대로 보여 준다.
 */
public class BankApiException extends RuntimeException {

    private final String code;
    private final long retryAfterSec;

    public BankApiException(String code, String message) {
        this(code, message, 0L);
    }

    public BankApiException(String code, String message, long retryAfterSec) {
        super(message);
        this.code = code;
        this.retryAfterSec = retryAfterSec;
    }

    public String code() {
        return code;
    }

    /** 429 계열에서만 0 보다 크다. 화면이 "N초 후" 안내를 만들 때 쓴다. */
    public long retryAfterSec() {
        return retryAfterSec;
    }
}
