package com.assetflow.auth;

import com.assetflow.auth.dto.LoginRequest;
import com.assetflow.auth.dto.LoginResponse;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    public LoginResponse login(LoginRequest request) {
        // TODO: Replace with real user lookup and password hash verification.
        if (request.getEmail() == null || request.getPassword() == null) {
            throw new IllegalArgumentException("Invalid credentials");
        }
        return new LoginResponse("mock-jwt-token");
    }
}
