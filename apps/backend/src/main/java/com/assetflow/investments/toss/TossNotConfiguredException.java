package com.assetflow.investments.toss;

/**
 * 토스증권 연동이 비활성화되었거나 자격증명이 없을 때 던진다.
 * API 는 503 Service Unavailable 로 매핑한다. 메시지에 자격증명을 넣지 않는다.
 */
public class TossNotConfiguredException extends RuntimeException {

    public TossNotConfiguredException(String message) {
        super(message);
    }
}
