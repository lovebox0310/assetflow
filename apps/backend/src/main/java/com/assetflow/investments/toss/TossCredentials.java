package com.assetflow.investments.toss;

/**
 * 토스증권 Open API 자격증명 (이슈 #55 Stage 1).
 *
 * <p>clientId/clientSecret 은 평문이며 {@link TossCredentialsService} 가 AES/GCM 으로
 * 암호화해 저장한다. 로그·에러 메시지·API 응답에 평문을 남기지 않는다.</p>
 *
 * @param accountId      연결할 자산 계좌 ID (아직 고르지 않았으면 null)
 * @param clientId       토스증권 Open API client id
 * @param clientSecret   토스증권 Open API client secret
 * @param tossAccountSeq 토스 계좌 식별자 (X-Tossinvest-Account 헤더 값, 없으면 null)
 */
public record TossCredentials(
        Long accountId,
        String clientId,
        String clientSecret,
        String tossAccountSeq) {

    public boolean hasCredentials() {
        return clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank();
    }

    /** 응답에 노출해도 되는 계좌 식별자 보유 여부. */
    public boolean hasAccountSeq() {
        return tossAccountSeq != null && !tossAccountSeq.isBlank();
    }
}
