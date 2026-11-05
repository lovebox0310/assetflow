package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.common.api.NotFoundException;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import com.assetflow.investments.PortfolioService.Portfolio;
import com.assetflow.investments.kis.KisAccountMappingService;
import com.assetflow.investments.kis.KisBalanceResponse;
import com.assetflow.investments.kis.KisBalanceService;
import com.assetflow.investments.kis.KisCredentials;
import com.assetflow.investments.kis.KisCredentialsService;
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
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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
    private final KisBalanceService kisBalanceService;
    private final KisAccountMappingService kisMappingService;
    private final KisCredentialsService kisCredentialsService;

    public InvestmentController(InvestmentLedger ledger, AssetLedger assetLedger,
                                PortfolioService portfolioService,
                                KisBalanceService kisBalanceService,
                                KisAccountMappingService kisMappingService,
                                KisCredentialsService kisCredentialsService) {
        this.ledger = ledger;
        this.assetLedger = assetLedger;
        this.portfolioService = portfolioService;
        this.kisBalanceService = kisBalanceService;
        this.kisMappingService = kisMappingService;
        this.kisCredentialsService = kisCredentialsService;
    }

    public record UpsertRequest(Long accountId, String assetClass, String symbol, String name,
                                String currency, BigDecimal quantity, BigDecimal avgPrice,
                                BigDecimal marketPrice, BigDecimal fxRate, String priceAsOf) {}

    public record SyncKisRequest(Long accountId) {}

    public record KisCredentialsRequest(String appKey, String appSecret, String baseUrl,
                                         String cano, String acntPrdtCd) {}

    @GetMapping("/holdings")
    public ApiResponse<Portfolio> holdings() {
        return new ApiResponse<>("OK", "Holdings loaded", portfolioService.portfolio());
    }

    /**
     * §62 한국투자증권 국내주식 잔고를 가져와 보유종목을 동기화한다.
     * - accountId 는 account_type='invest' 인 계좌여야 한다.
     * - KIS 자격증명은 DB의 kis_account_credentials 에서 조회한다.
     * - 기존에 같은 심볼이 있으면 update, 없으면 create 한다.
     *   KIS 에 없는 기존 종목은 삭제하지 않는다(수동 입력 보호).
     */
    @PostMapping("/holdings/sync-kis")
    public ApiResponse<Portfolio> syncKis(@RequestBody SyncKisRequest request) {
        if (request.accountId() == null) {
            throw new IllegalArgumentException("accountId is required");
        }
        AssetRow account = assetLedger.byId(request.accountId());
        if (account == null) {
            throw new IllegalArgumentException("account not found: " + request.accountId());
        }
        if (!"invest".equals(account.accountType())) {
            throw new IllegalArgumentException("account must be an invest account");
        }

        KisCredentials credentials = kisCredentialsService.findDecrypted(account.id());
        if (credentials == null) {
            throw new IllegalArgumentException("KIS credentials not configured for account: " + account.id());
        }

        KisBalanceResponse balance = kisBalanceService.fetchBalance(credentials);
        String priceAsOf = LocalDate.now().toString();

        // §62 CMA 계좌처럼 보유종목은 없고 현금만 있는 경우, 예수금도 동기화한다.
        if (balance.summary() != null && balance.summary().dncaTotAmt() != null) {
            long cash = balance.summary().dncaTotAmt().longValue();
            assetLedger.update(account.id(), account.accountType(), account.name(),
                    account.institutionName(), cash, account.isDebt(), account.openedAt());
        }

        Map<String, HoldingRow> existingBySymbol = ledger.all().stream()
                .filter(h -> h.accountId() == request.accountId() && h.symbol() != null && !h.symbol().isBlank())
                .collect(Collectors.toMap(HoldingRow::symbol, h -> h, (a, b) -> a));

        for (KisBalanceResponse.Holding h : balance.holdings()) {
            String symbol = h.pdno();
            if (symbol == null || symbol.isBlank()) {
                continue;
            }
            HoldingRow row = new HoldingRow(
                    0, request.accountId(), "stock", symbol, h.prdtName(), "KRW",
                    h.hldgQty(), h.pchsAvgPric(), h.prpr(), BigDecimal.ONE, priceAsOf);
            HoldingRow old = existingBySymbol.get(symbol);
            if (old != null) {
                ledger.update(old.id(), row);
            } else {
                ledger.create(row);
            }
        }
        return new ApiResponse<>("OK", "KIS balance synced", portfolioService.portfolio());
    }

    /**
     * §62.1 계좌명으로 등록된 KIS 계좌번호(CANO/상품코드) 매핑을 조회한다.
     * 매핑이 없으면 404 를 돌려준다.
     */
    @GetMapping("/holdings/kis-mapping/{accountName}")
    public ApiResponse<KisAccountMappingService.Mapping> kisMapping(@PathVariable String accountName) {
        KisAccountMappingService.Mapping mapping = kisMappingService.findByAccountName(accountName);
        if (mapping == null) {
            throw new NotFoundException("KIS mapping not found for " + accountName);
        }
        return new ApiResponse<>("OK", "KIS mapping found", mapping);
    }

    /**
     * §62.2 계좌별 KIS 자격증명을 조회한다.
     * appKey/appSecret 은 마스킹하여 반환한다.
     */
    @GetMapping("/accounts/{accountId}/kis-credentials")
    public ApiResponse<KisCredentials> getKisCredentials(@PathVariable long accountId) {
        KisCredentials credentials = kisCredentialsService.findDecrypted(accountId);
        if (credentials == null) {
            throw new NotFoundException("KIS credentials not found for account " + accountId);
        }
        return new ApiResponse<>("OK", "KIS credentials found", kisCredentialsService.mask(credentials));
    }

    /**
     * §62.2 계좌별 KIS 자격증명을 저장한다.
     */
    @PostMapping("/accounts/{accountId}/kis-credentials")
    public ApiResponse<KisCredentials> saveKisCredentials(@PathVariable long accountId,
                                                          @RequestBody KisCredentialsRequest request) {
        AssetRow account = assetLedger.byId(accountId);
        if (account == null) {
            throw new IllegalArgumentException("account not found: " + accountId);
        }
        if (!"invest".equals(account.accountType())) {
            throw new IllegalArgumentException("account must be an invest account");
        }
        if (request.appKey() == null || request.appKey().isBlank()) {
            throw new IllegalArgumentException("appKey is required");
        }
        if (request.appSecret() == null || request.appSecret().isBlank()) {
            throw new IllegalArgumentException("appSecret is required");
        }
        if (request.cano() == null || request.cano().isBlank()) {
            throw new IllegalArgumentException("cano is required");
        }
        if (request.acntPrdtCd() == null || request.acntPrdtCd().isBlank()) {
            throw new IllegalArgumentException("acntPrdtCd is required");
        }
        KisCredentials plain = new KisCredentials(
                accountId, request.appKey(), request.appSecret(),
                request.baseUrl(), request.cano(), request.acntPrdtCd());
        KisCredentials saved = kisCredentialsService.save(1L, plain);
        return new ApiResponse<>("OK", "KIS credentials saved", kisCredentialsService.mask(saved));
    }

    /**
     * §62.2 계좌별 KIS 자격증명을 삭제한다.
     */
    @DeleteMapping("/accounts/{accountId}/kis-credentials")
    public ApiResponse<Void> deleteKisCredentials(@PathVariable long accountId) {
        kisCredentialsService.delete(1L, accountId);
        return new ApiResponse<>("OK", "KIS credentials deleted", null);
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

    public record ClearKisRequest(Long accountId) {}

    /**
     * §62 한국투자증권 동기화 해제.
     * - 해당 계좌의 모든 보유종목을 삭제한다.
     * - 예수금도 0으로 초기화한다(동기화로 들어온 예수금을 되돌린다).
     */
    @PostMapping("/holdings/clear-kis")
    public ApiResponse<Portfolio> clearKis(@RequestBody ClearKisRequest request) {
        if (request.accountId() == null) {
            throw new IllegalArgumentException("accountId is required");
        }
        AssetRow account = assetLedger.byId(request.accountId());
        if (account == null) {
            throw new IllegalArgumentException("account not found: " + request.accountId());
        }
        if (!"invest".equals(account.accountType())) {
            throw new IllegalArgumentException("account must be an invest account");
        }
        ledger.deleteByAccountId(request.accountId());
        assetLedger.update(account.id(), account.accountType(), account.name(),
                account.institutionName(), 0, account.isDebt(), account.openedAt());
        return new ApiResponse<>("OK", "KIS sync cleared", portfolioService.portfolio());
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
