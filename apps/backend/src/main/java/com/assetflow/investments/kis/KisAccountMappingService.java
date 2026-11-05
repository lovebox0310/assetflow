package com.assetflow.investments.kis;

import com.assetflow.assets.AssetLedger;
import org.springframework.stereotype.Service;

/**
 * §62.1 KIS 계좌 매핑 관리.
 *
 * <p>자격증명은 DB의 {@code kis_account_credentials} 테이블에 저장되며,
 * 계좌명으로 자산 계좌를 찾은 뒤 해당 계좌의 credentials 를 반환한다.</p>
 */
@Service
public class KisAccountMappingService {

    public record Mapping(String cano, String acntPrdtCd) {}

    private final AssetLedger assetLedger;
    private final KisCredentialsService credentialsService;

    public KisAccountMappingService(AssetLedger assetLedger, KisCredentialsService credentialsService) {
        this.assetLedger = assetLedger;
        this.credentialsService = credentialsService;
    }

    /**
     * @param accountName 자산 계좌 이름 (예: "키움 투자금")
     * @return KIS 계좌번호 매핑, 없으면 null
     */
    public Mapping findByAccountName(String accountName) {
        return assetLedger.all().stream()
                .filter(a -> a.name().equals(accountName))
                .findFirst()
                .map(a -> credentialsService.findDecrypted(a.id()))
                .filter(c -> c != null)
                .map(c -> new Mapping(c.cano(), c.acntPrdtCd()))
                .orElse(null);
    }
}
