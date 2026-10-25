package com.assetflow.auth;

import com.assetflow.auth.dto.LoginRequest;
import com.assetflow.auth.dto.LoginResponse;
import com.assetflow.auth.dto.PasswordUpdateRequest;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.settings.AuthEmailResolver;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final AuthEmailResolver emailResolver;

    public AuthController(AuthService authService, AuthEmailResolver emailResolver) {
        this.authService = authService;
        this.emailResolver = emailResolver;
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@RequestBody LoginRequest request) {
        LoginResponse response = authService.login(request);
        return new ApiResponse<>("OK", "Login success", response);
    }

    /** 비밀번호 변경 — Bearer 인증 필요. WebConfig 에서 /api/v1/auth/password 는 보호 경로로 등록한다. */
    @PutMapping("/password")
    public ApiResponse<Void> updatePassword(@RequestBody PasswordUpdateRequest request) {
        authService.updatePassword(emailResolver.currentEmail(), request.currentPassword(), request.newPassword());
        return new ApiResponse<>("OK", "Password updated", null);
    }
}
