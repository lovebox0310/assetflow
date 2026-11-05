package com.assetflow.investments.kis;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * §62 한국투자증권 Open API(KIS Developers) 전역 설정.
 *
 * <p>appKey/appSecret 은 계좌별로 DB에 저장하므로 여기서는 제거한다.
 * baseUrl 은 전역 기본값이며, 계좌별로 오버라이드할 수 있다.</p>
 */
@ConfigurationProperties(prefix = "app.kis")
public class KisProperties {

    private boolean enabled = false;
    private String baseUrl = "https://openapivts.koreainvestment.com:29443";
    private int tokenExpirySeconds = 86400;

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

    public int getTokenExpirySeconds() {
        return tokenExpirySeconds;
    }

    public void setTokenExpirySeconds(int tokenExpirySeconds) {
        this.tokenExpirySeconds = tokenExpirySeconds;
    }
}
