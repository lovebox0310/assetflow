package com.assetflow.investments.bond;

import com.assetflow.assets.AssetLedger;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.investments.kis.KisCredentials;
import com.assetflow.investments.kis.KisCredentialsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 채권 평가단가 조회 API (BOND-VALUE-1).
 * 액면(face)과 표준코드(pdno)로 KIS 평균단가를 조회해 평가금액을 계산한다.
 * 자격증명 없음/KIS 오류는 200 + error, 액면이 0 이하이면 400 이다.
 */
@RestController
@RequestMapping("/api/v1/investments")
public class BondValuationController {

    private static final BondValuationService.BondValuation MISSING_CREDENTIALS =
            new BondValuationService.BondValuation(null, null, null, null, 0, null, null, null,
                    null, null, "KIS 자격증명이 없습니다");

    private final AssetLedger assets;
    private final KisCredentialsService credentialsService;
    private final BondValuationService service;

    public BondValuationController(AssetLedger assets, KisCredentialsService credentialsService,
                                   BondValuationService service) {
        this.assets = assets;
        this.credentialsService = credentialsService;
        this.service = service;
    }

    @GetMapping("/accounts/{accountId}/bond-valuation")
    public ApiResponse<BondValuationService.BondValuation> valuation(
            @PathVariable long accountId,
            @RequestParam(required = false) String pdno,
            @RequestParam(defaultValue = "0") long face) {
        if (face <= 0) {
            throw new IllegalArgumentException("faceAmount must be positive");
        }
        AssetLedger.AssetRow account = assets.byId(accountId);
        if (account == null) {
            throw new IllegalArgumentException("account not found: " + accountId);
        }
        if (!"invest".equals(account.accountType())) {
            throw new IllegalArgumentException("account must be an invest account");
        }
        KisCredentials credentials = credentialsService.findDecrypted(accountId);
        if (credentials == null) {
            return new ApiResponse<>("OK", "Bond valuation", MISSING_CREDENTIALS);
        }
        return new ApiResponse<>("OK", "Bond valuation", service.fetch(credentials, pdno, face));
    }
}
