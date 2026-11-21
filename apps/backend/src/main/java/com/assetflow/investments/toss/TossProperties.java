package com.assetflow.investments.toss;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 토스증권 Open API 전역 설정 (이슈 #55 Stage 1).
 *
 * <p>client id/secret 은 사용자별로 DB 에 암호화 저장하므로 여기서는 다루지 않는다.
 * {@code enabled=false} 이면 연결 테스트는 503(TOSS_NOT_CONFIGURED) 을 돌려준다.</p>
 */
@ConfigurationProperties(prefix = "app.toss")
public class TossProperties {

    private boolean enabled = false;
    private String baseUrl = "https://openapi.tossinvest.com";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }
}
