package com.assetflow.investments.toss;

/**
 * 토스증권 API 호출 중 발생한 오류. API 는 502 Bad Gateway 로 매핑한다.
 * 메시지는 {@link TossErrorMessages} 가 만든 사용자 문구이며 자격증명을 담지 않는다.
 */
public class TossApiException extends RuntimeException {

    private final String code;

    public TossApiException(String code) {
        super(TossErrorMessages.message(code));
        this.code = code;
    }

    public TossApiException(String code, Throwable cause) {
        super(TossErrorMessages.message(code), cause);
        this.code = code;
    }

    /** 토스가 돌려준 오류 코드(로그·진단용, 화면에는 메시지만 쓴다). */
    public String code() {
        return code;
    }
}
