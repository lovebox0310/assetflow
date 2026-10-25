package com.assetflow.auth;

import com.assetflow.auth.dto.LoginRequest;
import com.assetflow.auth.dto.LoginResponse;
import com.assetflow.common.api.AuthRequiredException;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 로그인의 인메모리 구현 (테스트·CI). 시드 계정 user@example.com / password 만 수용한다.
 * postgres 프로필에서는 PostgresAuthService 가 users 테이블로 검증한다.
 */
@Component
@Profile("!postgres")
public class InMemoryAuthService implements AuthService {

    private static final int MIN_PASSWORD_LENGTH = 8;

    /** BCrypt("password") — §36.2 시드 기준선과 같은 개발용 자격증명. */
    private static final String SEED_HASH = "$2a$10$ylckM99KsYyp38gWOsH7W.RT7uF5//Rxo3R5SEIC.VpNZAn.xCYJK";
    private static final String SEED_EMAIL = "user@example.com";

    private final TokenService tokenService;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private String currentHash = SEED_HASH;

    public InMemoryAuthService(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    public LoginResponse login(LoginRequest request) {
        if (request.getEmail() == null || request.getPassword() == null) {
            throw new IllegalArgumentException("Invalid credentials");
        }
        boolean ok = SEED_EMAIL.equals(request.getEmail())
                && encoder.matches(request.getPassword(), currentHash);
        if (!ok) {
            // §21: 계정 존재 여부를 노출하지 않는 공통 메시지
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
        if (!SEED_EMAIL.equals(email) || !encoder.matches(currentPassword, currentHash)) {
            throw new AuthRequiredException("Invalid credentials");
        }
        currentHash = encoder.encode(newPassword);
    }
}
