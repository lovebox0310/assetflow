package com.assetflow.common.api;

/**
 * §25 실패 응답 표준: code, message, details, timestamp.
 * 성공 응답은 ApiResponse(code/message/data), 실패만 이 구조를 쓴다.
 */
public record ErrorResponse(String code, String message, String details, String timestamp) {
    public static ErrorResponse of(String code, String message, String details) {
        return new ErrorResponse(code, message, details, java.time.Instant.now().toString());
    }
}
