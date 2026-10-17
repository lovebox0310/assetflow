package com.assetflow.auth;

import com.assetflow.auth.dto.LoginRequest;
import com.assetflow.auth.dto.LoginResponse;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthServiceTest {

    private final AuthService service = new AuthService();

    @Test
    void returnsTokenForNonNullCredentials() {
        LoginRequest request = new LoginRequest();
        request.setEmail("user@example.com");
        request.setPassword("password123");

        LoginResponse response = service.login(request);

        assertEquals("mock-jwt-token", response.getToken());
    }

    @Test
    void rejectsNullEmailLikeTheFrontendContract() {
        LoginRequest request = new LoginRequest();
        request.setPassword("password123");

        assertThrows(IllegalArgumentException.class, () -> service.login(request));
    }
}
