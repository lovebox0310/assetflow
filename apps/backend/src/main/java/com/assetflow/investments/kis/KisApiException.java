package com.assetflow.investments.kis;

/**
 * KIS API 호출 중 발생한 오류.
 * API 는 502 Bad Gateway 로 매핑한다.
 */
public class KisApiException extends RuntimeException {

    public KisApiException(String message) {
        super(message);
    }

    public KisApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
