package com.assetflow.investments.upbit;

/**
 * 업비트 API 호출 실패. API 는 502 Bad Gateway 로 매핑한다.
 * status 는 HTTP 상태, code 는 업비트가 준 error.name(없으면 합성 코드)이다.
 * 메시지에 키·JWT·Authorization 헤더를 담지 않는다.
 */
public class UpbitApiException extends RuntimeException {

    private final int status;
    private final String code;

    public UpbitApiException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }
}
