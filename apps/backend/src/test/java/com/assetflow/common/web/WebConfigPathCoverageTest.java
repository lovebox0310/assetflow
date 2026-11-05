package com.assetflow.common.web;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.PathMatcher;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * §65 회귀 방지: WebConfig 의 보호 경로가 실제 컨트롤러 경로를 모두 덮는지 검사한다.
 *
 * <p>과거 {@code addPathPatterns} 에 경로를 하나씩 나열했고
 * {@code /api/v1/card-email-import-settings} 가 빠져 있었다. 그러면 인터셉터가 실행되지 않아
 * {@code auth.email} 요청 속성이 없고, {@code AuthEmailResolver} 가 유효한 토큰에도 401 을
 * 던져 화면이 로그인 페이지로 튕겼다. 이 테스트는 같은 누락이 다시 생기면 실패한다.</p>
 */
class WebConfigPathCoverageTest {

    private final PathMatcher matcher = new AntPathMatcher();

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/v1/me",
            "/api/v1/dashboard/summary",
            "/api/v1/assets/accounts",
            "/api/v1/assets/accounts/1/refresh-balance",
            "/api/v1/expenses/items",
            "/api/v1/expenses/snapshots",
            "/api/v1/settings",
            "/api/v1/investments/holdings",
            "/api/v1/investments/accounts/1/kis-credentials",
            "/api/v1/auth/password",
            // 이 경로가 빠져 있던 것이 실제 버그였다.
            "/api/v1/card-email-import-settings/hyundaicard",
            "/api/v1/card-email-import-settings/hyundaicard/run"
    })
    void 컨트롤러_경로는_인증_인터셉터가_적용된다(String path) {
        assertThat(isProtected(path)).as("%s 는 인증이 필요하다", path).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/auth/login", "/api/v1/auth/signup"})
    void 로그인과_회원가입은_인증없이_호출할수있다(String path) {
        assertThat(isProtected(path)).as("%s 는 공개 경로다", path).isFalse();
    }

    @Test
    void API_밖의_경로는_인터셉터_대상이_아니다() {
        assertThat(isProtected("/index.html")).isFalse();
        assertThat(isProtected("/")).isFalse();
    }

    private boolean isProtected(String path) {
        boolean matched = matchesAny(WebConfig.PROTECTED_PATHS, path);
        boolean excluded = matchesAny(WebConfig.PUBLIC_PATHS, path);
        return matched && !excluded;
    }

    private boolean matchesAny(String[] patterns, String path) {
        for (String pattern : patterns) {
            if (matcher.match(pattern, path)) {
                return true;
            }
        }
        return false;
    }
}
