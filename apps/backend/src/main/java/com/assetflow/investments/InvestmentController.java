package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import com.assetflow.investments.PortfolioService.Portfolio;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Set;

/**
 * 투자 보유종목 API (§54.2, Sprint 5 E1).
 * - GET    /api/v1/investments/holdings       → { holdings, accounts(예수금·평가액·총액) }
 * - POST   /api/v1/investments/holdings
 * - PUT    /api/v1/investments/holdings/{id}
 * - DELETE /api/v1/investments/holdings/{id}
 * §54.3: account_id 는 account_type='invest' 인 계좌만 허용한다(테이블 CHECK 로는 다른 표를 볼 수 없다).
 */
@RestController
@RequestMapping("/api/v1/investments")
public class InvestmentController {

    private static final Set<String> CLASSES = Set.of("stock", "etf", "bond", "fund", "crypto");

    private final InvestmentLedger ledger;
    private final AssetLedger assetLedger;
    private final PortfolioService portfolioService;

    public InvestmentController(InvestmentLedger ledger, AssetLedger assetLedger,
                                PortfolioService portfolioService) {
        this.ledger = ledger;
        this.assetLedger = assetLedger;
        this.portfolioService = portfolioService;
    }

    public record UpsertRequest(Long accountId, String assetClass, String symbol, String name,
                                String currency, BigDecimal quantity, BigDecimal avgPrice,
                                BigDecimal marketPrice, BigDecimal fxRate, String priceAsOf) {}

    @GetMapping("/holdings")
    public ApiResponse<Portfolio> holdings() {
        return new ApiResponse<>("OK", "Holdings loaded", portfolioService.portfolio());
    }

    @PostMapping("/holdings")
    public ApiResponse<HoldingRow> create(@RequestBody UpsertRequest request) {
        HoldingRow row = validateAndMap(request);
        return new ApiResponse<>("OK", "Holding created", ledger.create(row));
    }

    @PutMapping("/holdings/{id}")
    public ApiResponse<HoldingRow> update(@PathVariable long id, @RequestBody UpsertRequest request) {
        HoldingRow row = validateAndMap(request);
        return new ApiResponse<>("OK", "Holding updated", ledger.update(id, row));
    }

    @DeleteMapping("/holdings/{id}")
    public ApiResponse<Long> delete(@PathVariable long id) {
        ledger.delete(id);
        return new ApiResponse<>("OK", "Holding deleted", id);
    }

    private HoldingRow validateAndMap(UpsertRequest request) {
        if (request.accountId() == null) {
            throw new IllegalArgumentException("accountId is required");
        }
        AssetRow account = assetLedger.all().stream()
                .filter(a -> a.id() == request.accountId())
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("account not found: " + request.accountId()));
        if (!"invest".equals(account.accountType())) {
            throw new IllegalArgumentException("account must be an invest account");
        }
        if (request.assetClass() == null || !CLASSES.contains(request.assetClass())) {
            throw new IllegalArgumentException("assetClass must be one of stock|etf|bond|fund|crypto");
        }
        if (request.name() == null || request.name().isBlank() || request.name().length() > 100) {
            throw new IllegalArgumentException("name is required (max 100)");
        }
        if (request.symbol() != null && request.symbol().length() > 32) {
            throw new IllegalArgumentException("symbol must be at most 32 characters");
        }
        String currency = request.currency() == null || request.currency().isBlank()
                ? "KRW" : request.currency().toUpperCase();
        if (!currency.matches("[A-Z]{3}")) {
            throw new IllegalArgumentException("currency must be a 3-letter code");
        }
        requireNonNegative(request.quantity(), "quantity");
        requireNonNegative(request.avgPrice(), "avgPrice");
        requireNonNegative(request.marketPrice(), "marketPrice");
        if (request.fxRate() == null || request.fxRate().signum() <= 0) {
            throw new IllegalArgumentException("fxRate must be greater than 0");
        }
        String priceAsOf = null;
        if (request.priceAsOf() != null && !request.priceAsOf().isBlank()) {
            try {
                priceAsOf = LocalDate.parse(request.priceAsOf()).toString();
            } catch (DateTimeParseException e) {
                throw new IllegalArgumentException("priceAsOf must be YYYY-MM-DD");
            }
        }
        return new HoldingRow(0, request.accountId(), request.assetClass(),
                request.symbol() == null || request.symbol().isBlank() ? null : request.symbol(),
                request.name(), currency, request.quantity(), request.avgPrice(),
                request.marketPrice(), request.fxRate(), priceAsOf);
    }

    private static void requireNonNegative(BigDecimal value, String field) {
        if (value == null || value.signum() < 0) {
            throw new IllegalArgumentException(field + " must be a non-negative number");
        }
    }
}
