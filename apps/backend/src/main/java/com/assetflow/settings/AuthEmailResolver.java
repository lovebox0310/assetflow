package com.assetflow.settings;

import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

/**
 * 토큰의 사용자 이메일 접근자 — BearerTokenInterceptor 가 검증 후 요청 속성에 싣는다.
 * 컨트롤러는 요청 파라미터가 아니라 이 값으로 현재 사용자를 식별한다(§46).
 */
@Component
public class AuthEmailResolver {

    public String currentEmail() {
        Object email = RequestContextHolder.currentRequestAttributes()
                .getAttribute("auth.email", RequestAttributes.SCOPE_REQUEST);
        if (email == null) {
            throw new com.assetflow.common.api.AuthRequiredException("Not authenticated");
        }
        return (String) email;
    }
}
