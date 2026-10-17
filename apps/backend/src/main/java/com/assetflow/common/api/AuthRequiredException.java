package com.assetflow.common.api;

public class AuthRequiredException extends RuntimeException {
    public AuthRequiredException(String message) {
        super(message);
    }
}
