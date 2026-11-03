package com.assetflow.assets.bank;

import com.assetflow.common.api.ApiResponse;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 은행 잔액 빠른조회 API (§61).
 *
 * - GET    /api/v1/assets/bank/banks                       지원 은행 목록
 * - GET    /api/v1/assets/bank-links                       연결된 계좌 목록(계좌번호 마스킹)
 * - PUT    /api/v1/assets/accounts/{id}/bank-link          연결 + 1회 조회(잔액 갱신)
 * - DELETE /api/v1/assets/accounts/{id}/bank-link          연결 해제
 * - POST   /api/v1/assets/accounts/{id}/bank-sync          잔액 다시 가져오기
 *
 * 응답에 계좌 비밀번호·생년월일은 절대 포함하지 않는다.
 */
@RestController
@RequestMapping("/api/v1/assets")
public class BankSyncController {

    private final BankSyncService service;

    public BankSyncController(BankSyncService service) {
        this.service = service;
    }

    @GetMapping("/bank/banks")
    public ApiResponse<List<BankSyncService.BankOptionView>> banks() {
        return new ApiResponse<>("OK", "Supported banks", service.banks());
    }

    @GetMapping("/bank-links")
    public ApiResponse<List<BankSyncService.LinkView>> links() {
        return new ApiResponse<>("OK", "Bank links loaded", service.links());
    }

    @PutMapping("/accounts/{accountId}/bank-link")
    public ApiResponse<BankSyncService.LinkResult> link(@PathVariable long accountId,
                                                        @RequestBody BankSyncService.LinkRequest request) {
        return new ApiResponse<>("OK", "Bank account linked", service.link(accountId, request));
    }

    @DeleteMapping("/accounts/{accountId}/bank-link")
    public ApiResponse<Long> unlink(@PathVariable long accountId) {
        service.unlink(accountId);
        return new ApiResponse<>("OK", "Bank account unlinked", accountId);
    }

    @PostMapping("/accounts/{accountId}/bank-sync")
    public ApiResponse<BankSyncService.SyncResult> sync(@PathVariable long accountId,
                                                        @RequestBody BankSyncService.SyncRequest request) {
        return new ApiResponse<>("OK", "Bank balance synced", service.sync(accountId, request));
    }
}
