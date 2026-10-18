package com.assetflow.common.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * §25 오류 표준: 실패 응답은 전부 ErrorResponse(code, message, details, timestamp).
 * 401 인증 실패 / 403 권한 실패(스프린트 1 사용자 단일이라 아직 발생하지 않는다) /
 * 400 잘못된 요청 / 500 서버 오류를 구분한다.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

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

    /** GET 으로 POST 전용 API 를 호출하는 경우(브라우저 주소창 접속 등) — 500 이 아니라 405 다. */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> methodNotSupported(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(ErrorResponse.of("METHOD_NOT_ALLOWED", "Method not allowed", ""));
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> notFound(NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of("NOT_FOUND", "Resource not found", e.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> badRequest(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("INVALID_REQUEST", "Invalid request", e.getMessage()));
    }

    /** 프레임워크 400 계열: 필수 파라미터 누락·JSON 본문 파싱 실패는 500 이 아니라 400 이다. */
    @ExceptionHandler({MissingServletRequestParameterException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<ErrorResponse> frameworkBadRequest(Exception e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("INVALID_REQUEST", "Invalid request", ""));
    }

    /** 정적 리소스 부재(루트·favicon 등)는 오류가 아니라 404다 — catch-all 500 으로 묻지 않는다. */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> noResource(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of("NOT_FOUND", "Resource not found", ""));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> internalError(Exception e) {
        // 스택/내부 메시지를 노출하지 않는다 — details 는 여기서 비운다.
        // 원인 추적을 위해 서버 로그에는 스택 전체를 남긴다.
        log.error("Unhandled exception", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of("INTERNAL_ERROR", "Internal server error", ""));
    }
}
