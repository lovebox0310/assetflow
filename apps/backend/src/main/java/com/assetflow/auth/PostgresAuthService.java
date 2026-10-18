package com.assetflow.auth;

import com.assetflow.auth.dto.LoginRequest;
import com.assetflow.auth.dto.LoginResponse;
import com.assetflow.common.api.AuthRequiredException;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 로그인의 PostgreSQL 구현 — users 테이블(§37)의 password_hash(BCrypt) 를 검증한다.
 * §21: 실패는 계정 존재 여부를 노출하지 않는다(동일한 401).
 */
@Component
@Profile("postgres")
public class PostgresAuthService implements AuthService {

    private final JdbcTemplate jdbc;
    private final TokenService tokenService;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public PostgresAuthService(JdbcTemplate jdbc, TokenService tokenService) {
        this.jdbc = jdbc;
        this.tokenService = tokenService;
    }

    public LoginResponse login(LoginRequest request) {
        if (request.getEmail() == null || request.getPassword() == null) {
            throw new IllegalArgumentException("Invalid credentials");
        }
        List<String> hashes = jdbc.queryForList(
                "SELECT password_hash FROM users WHERE email = ?", String.class, request.getEmail());
        if (hashes.isEmpty() || !encoder.matches(request.getPassword(), hashes.get(0))) {
            throw new AuthRequiredException("Invalid credentials");
        }
        return new LoginResponse(tokenService.issue(request.getEmail()), System.currentTimeMillis() + 3_600_000);
    }
}
