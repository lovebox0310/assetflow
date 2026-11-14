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
 * 채권 발행정보 조회 API (BOND-INFO-1).
 *
 * <p>계좌·KIS 자격증명 문제와 KIS 호출 실패는 모두 200 + error 로 돌려준다 —
 * 보조 정보이므로 화면이 저장을 막지 않고 안내만 한다.</p>
 */
@RestController
@RequestMapping("/api/v1/investments")
public class BondIssueInfoController {

    private static final BondIssueInfoService.BondIssueInfo MISSING_CREDENTIALS =
            new BondIssueInfoService.BondIssueInfo(null, null, null, null, null, null,
                    "KIS 자격증명이 없습니다");

    private final AssetLedger assets;
    private final KisCredentialsService credentialsService;
    private final BondIssueInfoService service;

    public BondIssueInfoController(AssetLedger assets, KisCredentialsService credentialsService,
                                   BondIssueInfoService service) {
        this.assets = assets;
        this.credentialsService = credentialsService;
        this.service = service;
    }

    @GetMapping("/accounts/{accountId}/bond-issue-info")
    public ApiResponse<BondIssueInfoService.BondIssueInfo> issueInfo(
            @PathVariable long accountId,
            @RequestParam(required = false) String pdno) {
        AssetLedger.AssetRow account = assets.byId(accountId);
        if (account == null) {
            throw new IllegalArgumentException("account not found: " + accountId);
        }
        if (!"invest".equals(account.accountType())) {
            throw new IllegalArgumentException("account must be an invest account");
        }
        KisCredentials credentials = credentialsService.findDecrypted(accountId);
        if (credentials == null) {
            return new ApiResponse<>("OK", "Bond issue info", MISSING_CREDENTIALS);
        }
        return new ApiResponse<>("OK", "Bond issue info", service.fetch(credentials, pdno));
    }
}
