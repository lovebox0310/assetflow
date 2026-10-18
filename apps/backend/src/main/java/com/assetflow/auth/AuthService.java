package com.assetflow.auth;

import com.assetflow.auth.dto.LoginRequest;
import com.assetflow.auth.dto.LoginResponse;

/** 로그인 계약 — 구현은 InMemoryAuthService(테스트·CI) / PostgresAuthService(실 DB) 둘. */
public interface AuthService {

    LoginResponse login(LoginRequest request);
}
