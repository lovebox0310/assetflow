package com.assetflow.investments.kis;

/**
 * KIS 연동이 활성화되지 않았거나 자격증명이 없을 때 던진다.
 * API 는 503 Service Unavailable 로 매핑한다.
 */
public class KisNotConfiguredException extends RuntimeException {

    public KisNotConfiguredException(String message) {
        super(message);
    }
}
