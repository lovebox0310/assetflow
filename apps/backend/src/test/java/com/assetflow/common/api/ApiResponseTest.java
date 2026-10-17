package com.assetflow.common.api;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ApiResponseTest {

    @Test
    void holdsCodeMessageAndData() {
        ApiResponse<String> response = new ApiResponse<>("OK", "Login success", "token-1");

        assertEquals("OK", response.getCode());
        assertEquals("Login success", response.getMessage());
        assertEquals("token-1", response.getData());
    }
}
