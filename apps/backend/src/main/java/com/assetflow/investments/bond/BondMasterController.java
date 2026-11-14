package com.assetflow.investments.bond;

import com.assetflow.common.api.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 채권 마스터 검색 API (BOND-SEARCH-1).
 * 이름/코드 부분일치 결과와, 마스터 갱신 실패 시 warning 을 함께 돌려준다.
 * 다운로드 실패도 500 이 아니라 200 + 빈 목록 + warning 이다.
 */
@RestController
@RequestMapping("/api/v1/investments")
public class BondMasterController {

    private final BondMasterService bonds;

    public BondMasterController(BondMasterService bonds) {
        this.bonds = bonds;
    }

    @GetMapping("/bonds")
    public ApiResponse<BondMasterService.BondSearchResult> search(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "20") int limit) {
        return new ApiResponse<>("OK", "Bond master searched", bonds.search(q, limit));
    }
}
