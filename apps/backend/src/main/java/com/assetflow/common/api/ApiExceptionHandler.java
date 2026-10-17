package com.assetflow.common.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * §25 오류 표준: 실패 응답은 전부 ErrorResponse(code, message, details, timestamp).
 * 401 인증 실패 / 403 권한 실패(스프린트 1 사용자 단일이라 아직 발생하지 않는다) /
 * 400 잘못된 요청 / 500 서버 오류를 구분한다.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(AuthRequiredException.class)
    public ResponseEntity<ErrorResponse> authRequired(AuthRequiredException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of("AUTH_REQUIRED", "Authentication required", e.getMessage()));
    }

    /** 403 자리표시자: 스프린트 1에 권한 계층이 없어 발생하지 않지만, 포맷은 표준을 쓴다. */
    @ExceptionHandler(PermissionDeniedException.class)
    public ResponseEntity<ErrorResponse> permissionDenied(PermissionDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ErrorResponse.of("PERMISSION_DENIED", "Permission denied", e.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> badRequest(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("INVALID_REQUEST", "Invalid request", e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> internalError(Exception e) {
        // 스택/내부 메시지를 노출하지 않는다 — details 는 여기서 비운다.
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of("INTERNAL_ERROR", "Internal server error", ""));
    }
}
