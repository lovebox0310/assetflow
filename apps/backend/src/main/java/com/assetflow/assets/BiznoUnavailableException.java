package com.assetflow.assets;

/**
 * bizno.net 이 접속대기(혼잡) 페이지를 돌려줬거나 응답을 해석할 수 없을 때 던진다.
 * API 는 503 / BIZNO_BUSY 로 변환하고, 화면은 "잠시 후 다시 시도" 안내를 띄운다.
 */
public class BiznoUnavailableException extends RuntimeException {
    public BiznoUnavailableException(String message) {
        super(message);
    }

    public BiznoUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
