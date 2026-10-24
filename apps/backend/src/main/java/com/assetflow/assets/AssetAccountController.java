package com.assetflow.assets;

import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.common.api.NotFoundException;
import com.assetflow.investments.InvestmentLedger;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

/**
 * 자산 계정 CRUD API (§40). §37 asset_accounts 스키마와 동일 필드.
 * 경계 검증: accountType enum, balance 음수 금지, name 필수 —
 * 화면 검증을 우회한 호출도 통과하지 못하게 한다.
 */
@RestController
@RequestMapping("/api/v1/assets")
public class AssetAccountController {

    private static final Set<String> TYPES = Set.of("cash", "deposit", "invest", "realty");

    private final AssetLedger ledger;
    private final InvestmentLedger investmentLedger;

    public AssetAccountController(AssetLedger ledger, InvestmentLedger investmentLedger) {
        this.ledger = ledger;
        this.investmentLedger = investmentLedger;
    }

    public record UpsertRequest(String accountType, String name, String institutionName,
                                Long balance, Boolean isDebt, String openedAt) {}

    @GetMapping("/accounts")
    public ApiResponse<List<AssetRow>> accounts() {
        return new ApiResponse<>("OK", "Accounts loaded", ledger.all());
    }

    @PostMapping("/accounts")
    public ApiResponse<AssetRow> create(@RequestBody UpsertRequest request) {
        validate(request);
        AssetRow row = ledger.create(request.accountType(), request.name(),
                request.institutionName(), request.balance(), request.isDebt(), request.openedAt());
        return new ApiResponse<>("OK", "Account created", row);
    }

    @PutMapping("/accounts/{id}")
    public ApiResponse<AssetRow> update(@PathVariable long id, @RequestBody UpsertRequest request) {
        validate(request);
        AssetRow existing = ledger.byId(id);
        if (existing == null) {
            throw new NotFoundException("account id " + id);
        }
        // invest 계정에서 다른 타입으로 바꾸려면 보유종목이 없어야 한다
        if ("invest".equals(existing.accountType()) && !"invest".equals(request.accountType())) {
            boolean hasHoldings = investmentLedger.all().stream().anyMatch(h -> h.accountId() == id);
            if (hasHoldings) {
                throw new IllegalArgumentException("cannot change type: account has holdings");
            }
        }
        return new ApiResponse<>("OK", "Account updated", ledger.update(id, request.accountType(),
                request.name(), request.institutionName(), request.balance(), request.isDebt(), request.openedAt()));
    }

    @DeleteMapping("/accounts/{id}")
    public ApiResponse<Long> delete(@PathVariable long id) {
        AssetRow existing = ledger.byId(id);
        if (existing == null) {
            throw new NotFoundException("account id " + id);
        }
        if ("invest".equals(existing.accountType())) {
            investmentLedger.deleteByAccountId(id);
        }
        ledger.delete(id);
        return new ApiResponse<>("OK", "Account deleted", id);
    }

    private void validate(UpsertRequest request) {
        if (request.accountType() == null || !TYPES.contains(request.accountType())) {
            throw new IllegalArgumentException("accountType must be one of cash|deposit|invest|realty");
        }
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        if (request.balance() == null || request.balance() < 0) {
            throw new IllegalArgumentException("balance must be a non-negative integer");
        }
        if (request.isDebt() == null) {
            throw new IllegalArgumentException("isDebt is required");
        }
    }
}
