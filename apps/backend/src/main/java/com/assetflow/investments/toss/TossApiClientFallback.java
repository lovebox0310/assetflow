package com.assetflow.investments.toss;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;

/**
 * {@code app.toss.enabled=false}(기본) 일 때의 토스 API 클라이언트 (이슈 #55 Stage 2).
 *
 * <p>Stage 1 의 자리표시자를 대체한다. 빈을 아예 두지 않으면 컨트롤러 주입이 깨져
 * 부팅이 실패하므로, 꺼져 있을 때는 <b>거짓 성공 대신</b> 503({@link TossNotConfiguredException})을
 * 돌려주는 구현을 하나 둔다. 실제 HTTP 는 {@link HttpTossApiClient} 담당이다.</p>
 */
@Component
@ConditionalOnProperty(prefix = "app.toss", name = "enabled", havingValue = "false", matchIfMissing = true)
public class TossApiClientFallback implements TossApiClient {

    private static final String MESSAGE = "토스 연동이 비활성화되어 있습니다(app.toss.enabled)";

    @Override
    public void verify(TossCredentials credentials) {
        throw notConfigured();
    }

    @Override
    public List<TossAccount> accounts(TossCredentials credentials) {
        throw notConfigured();
    }

    @Override
    public TossHoldings holdings(TossCredentials credentials) {
        throw notConfigured();
    }

    @Override
    public BigDecimal usdKrwRate(TossCredentials credentials) {
        throw notConfigured();
    }

    private static TossNotConfiguredException notConfigured() {
        return new TossNotConfiguredException(MESSAGE);
    }

    @Override
    public TokenDiagnosis diagnoseToken(TossCredentials credentials) {
        throw notConfigured();
    }
}
