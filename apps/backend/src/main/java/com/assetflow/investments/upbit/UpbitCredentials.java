package com.assetflow.investments.upbit;

/**
 * 업비트 Open API 자격증명 평문 (UPBIT-2).
 * 저장 시 {@link UpbitCredentialsService} 가 AES/GCM 으로 암호화한다.
 * 로그·에러 메시지에 이 값을 남기지 않는다.
 */
public record UpbitCredentials(String accessKey, String secretKey) {}
