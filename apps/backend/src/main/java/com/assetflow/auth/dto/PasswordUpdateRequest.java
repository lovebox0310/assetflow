package com.assetflow.auth.dto;

/**
 * 비밀번호 변경 요청 (설정 화면).
 * 현재 비밀번호 검증 후 새 비밀번호로 교체한다.
 */
public record PasswordUpdateRequest(String currentPassword, String newPassword) {}
