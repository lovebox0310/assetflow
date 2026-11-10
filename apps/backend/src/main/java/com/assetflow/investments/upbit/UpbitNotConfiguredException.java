package com.assetflow.investments.upbit;

/**
 * 업비트 자격증명이 없을 때 던진다. API 는 503 Service Unavailable 로 매핑한다.
 * 메시지에 키·토큰을 넣지 않는다.
 */
public class UpbitNotConfiguredException extends RuntimeException {

    public UpbitNotConfiguredException(String message) {
        super(message);
    }
}
