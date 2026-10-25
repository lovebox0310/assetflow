package com.assetflow.auth;

import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.settings.AuthEmailResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §21/§46: 로그인 및 비밀번호 변경 API 계약. 비밀번호 변경은 Bearer 인증이 필요하다.
 */
class AuthControllerApiTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";

    private MockMvc mvc;
    private TokenService tokenService;
    private InMemoryAuthService authService;

    private MockMvc mvcWithoutAuth;

    @BeforeEach
    void setUp() {
        tokenService = new TokenService(SECRET);
        authService = new InMemoryAuthService(tokenService);
        AuthEmailResolver emailResolver = new AuthEmailResolver() {
            @Override
            public String currentEmail() {
                return "user@example.com";
            }
        };
        AuthController controller = new AuthController(authService, emailResolver);
        mvcWithoutAuth = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
        mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(tokenService))
                .build();
    }

    @Test
    void loginReturnsToken() throws Exception {
        mvcWithoutAuth.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"user@example.com\",\"password\":\"password\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("OK"))
                .andExpect(jsonPath("$.data.token").exists());
    }

    @Test
    void passwordUpdateRequiresAuthentication() throws Exception {
        mvc.perform(put("/api/v1/auth/password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"password\",\"newPassword\":\"newpass123\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    @Test
    void passwordUpdateSucceedsWithValidTokenAndCredentials() throws Exception {
        String token = tokenService.issue("user@example.com");
        mvc.perform(put("/api/v1/auth/password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"password\",\"newPassword\":\"newpass123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("OK"));
    }

    @Test
    void passwordUpdateFailsWithWrongCurrentPassword() throws Exception {
        String token = tokenService.issue("user@example.com");
        mvc.perform(put("/api/v1/auth/password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"wrong-password\",\"newPassword\":\"newpass123\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    @Test
    void passwordUpdateFailsWithTooShortNewPassword() throws Exception {
        String token = tokenService.issue("user@example.com");
        mvc.perform(put("/api/v1/auth/password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"password\",\"newPassword\":\"short\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }
}
