package com.assetflow.auth;

import com.assetflow.auth.dto.LoginRequest;
import com.assetflow.auth.dto.LoginResponse;
import com.assetflow.auth.dto.SignupRequest;
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

    private static final int MIN_PASSWORD_LENGTH = 8;

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

    @Override
    public void updatePassword(String email, String currentPassword, String newPassword) {
        if (email == null || currentPassword == null || newPassword == null) {
            throw new IllegalArgumentException("current password and new password are required");
        }
        if (newPassword.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("new password must be at least " + MIN_PASSWORD_LENGTH + " characters");
        }
        List<String> hashes = jdbc.queryForList(
                "SELECT password_hash FROM users WHERE email = ?", String.class, email);
        if (hashes.isEmpty() || !encoder.matches(currentPassword, hashes.get(0))) {
            throw new AuthRequiredException("Invalid credentials");
        }
        String newHash = encoder.encode(newPassword);
        int updated = jdbc.update("UPDATE users SET password_hash = ? WHERE email = ?", newHash, email);
        if (updated == 0) {
            throw new com.assetflow.common.api.NotFoundException("user " + email);
        }
    }

    @Override
    public LoginResponse signup(SignupRequest request) {
        if (request.getEmail() == null || request.getPassword() == null) {
            throw new IllegalArgumentException("Email and password are required");
        }
        if (request.getPassword().length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("Password must be at least " + MIN_PASSWORD_LENGTH + " characters");
        }
        // 간단한 이메일 검증
        if (!request.getEmail().contains("@")) {
            throw new IllegalArgumentException("Invalid email format");
        }
        
        // 중복 확인
        List<String> existing = jdbc.queryForList(
                "SELECT email FROM users WHERE email = ?", String.class, request.getEmail());
        if (!existing.isEmpty()) {
            throw new IllegalArgumentException("Email already registered");
        }
        
        String passwordHash = encoder.encode(request.getPassword());
        String displayName = request.getDisplayName() != null ? request.getDisplayName() : request.getEmail();
        
        int inserted = jdbc.update(
                "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)",
                request.getEmail(), passwordHash, displayName);
        
        if (inserted == 0) {
            throw new IllegalArgumentException("Failed to create user");
        }
        
        return new LoginResponse(tokenService.issue(request.getEmail()), System.currentTimeMillis() + 3_600_000);
    }
}
