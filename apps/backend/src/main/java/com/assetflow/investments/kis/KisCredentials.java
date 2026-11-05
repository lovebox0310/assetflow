package com.assetflow.investments.kis;

/**
 * 한국투자증권(KIS) API 자격증명 (§62.2).
 *
 * <p>appKey 와 appSecret 은 평문이며, DB 저장 전/후 암호화 처리는
 * {@link KisCredentialsService}에서 담당한다.</p>
 *
 * @param accountId 자산 계좌 ID
 * @param appKey    KIS app key
 * @param appSecret KIS app secret
 * @param baseUrl   KIS API base URL (비어 있으면 전역 기본값 사용)
 * @param cano      계좌번호 앞 8자리
 * @param acntPrdtCd 계좌상품코드 (예: "01")
 */
public record KisCredentials(
        long accountId,
        String appKey,
        String appSecret,
        String baseUrl,
        String cano,
        String acntPrdtCd) {

    public boolean hasCredentials() {
        return appKey != null && !appKey.isBlank()
                && appSecret != null && !appSecret.isBlank();
    }

    public String effectiveBaseUrl(String defaultUrl) {
        return baseUrl != null && !baseUrl.isBlank() ? baseUrl : defaultUrl;
    }

    public boolean isMock() {
        String url = effectiveBaseUrl("");
        return url.contains("vts");
    }
}
