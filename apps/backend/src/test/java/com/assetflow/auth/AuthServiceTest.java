package com.assetflow.auth;

import com.assetflow.auth.dto.LoginRequest;
import com.assetflow.auth.dto.LoginResponse;
import com.assetflow.common.api.AuthRequiredException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthServiceTest {

    private final InMemoryAuthService service = new InMemoryAuthService(new TokenService("test-secret-0123456789-0123456789-0123456789"));

    @Test
    void issuesRealTokenForCorrectSeedCredentials() {
        LoginRequest request = new LoginRequest();
        request.setEmail("user@example.com");
        request.setPassword("password");

        LoginResponse response = service.login(request);

        assertTrue(response.getToken().split("\\.").length == 3);   // header.payload.signature
        assertTrue(response.getExpiresAt() > System.currentTimeMillis());
    }

    @Test
    void rejectsWrongPasswordWith401Contract() {
        LoginRequest request = new LoginRequest();
        request.setEmail("user@example.com");
        request.setPassword("wrong-password");

        assertThrows(AuthRequiredException.class, () -> service.login(request));
    }

    @Test
    void rejectsUnknownEmailLikeWrongPassword() {
        LoginRequest request = new LoginRequest();
        request.setEmail("nobody@example.com");
        request.setPassword("password");

        assertThrows(AuthRequiredException.class, () -> service.login(request));
    }

    @Test
    void rejectsNullEmailLikeTheFrontendContract() {
        LoginRequest request = new LoginRequest();
        request.setPassword("password123");

        assertThrows(IllegalArgumentException.class, () -> service.login(request));
    }

    @Test
    void updatesPasswordAndAuthenticatesWithNewOne() {
        service.updatePassword("user@example.com", "password", "newpass123");

        LoginRequest request = new LoginRequest();
        request.setEmail("user@example.com");
        request.setPassword("newpass123");

        LoginResponse response = service.login(request);
        assertTrue(response.getToken().split("\\.").length == 3);
    }

    @Test
    void rejectsPasswordUpdateWithWrongCurrentPassword() {
        assertThrows(AuthRequiredException.class,
                () -> service.updatePassword("user@example.com", "wrong-password", "newpass123"));
    }

    @Test
    void rejectsPasswordUpdateWithTooShortNewPassword() {
        assertThrows(IllegalArgumentException.class,
                () -> service.updatePassword("user@example.com", "password", "short"));
    }
}
