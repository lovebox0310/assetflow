package com.assetflow.auth;

import com.assetflow.auth.dto.LoginRequest;
import com.assetflow.auth.dto.LoginResponse;
import com.assetflow.auth.dto.SignupRequest;

/** 로그인·비밀번호 변경 계약 — 구현은 InMemoryAuthService(테스트·CI) / PostgresAuthService(실 DB) 둘. */
public interface AuthService {

    LoginResponse login(LoginRequest request);

    /** 현재 비밀번호를 검증한 뒤 새 비밀번호로 교체한다. */
    void updatePassword(String email, String currentPassword, String newPassword);

    /** 회원가입 (Sprint 1.1 임시, 프로덕션 미사용) */
    LoginResponse signup(SignupRequest request);
}
