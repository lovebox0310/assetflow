package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.common.api.NotFoundException;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import com.assetflow.investments.PortfolioService.Portfolio;
import com.assetflow.investments.kis.KisAccountMappingService;
import com.assetflow.investments.kis.KisApiException;
import com.assetflow.investments.kis.KisBalanceResponse;
import com.assetflow.investments.kis.KisBalanceService;
import com.assetflow.investments.kis.KisCredentials;
import com.assetflow.investments.kis.KisCredentialsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.ArrayList;
import java.util.List;
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

    private static final Logger log = LoggerFactory.getLogger(InvestmentController.class);
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
                                BigDecimal marketPrice, BigDecimal fxRate, String priceAsOf,
                                /** BOND-FORM-1: bond 일 때만 저장한다. YYYY-MM-DD. */
                                String issueDate, String maturityDate,
                                /** BOND-INFO-1: bond 일 때만 저장한다. */
                                String issuerName, BigDecimal couponRate,
                                /** BOND-VALUE-1: bond 일 때만 저장한다. 원 단위 액면. */
                                Long faceAmount) {}

    public record SyncKisRequest(Long accountId) {}

    public record KisCredentialsRequest(String appKey, String appSecret, String baseUrl,
                                         String cano, String acntPrdtCd) {}

    @GetMapping("/holdings")
    public ApiResponse<Portfolio> holdings() {
        return new ApiResponse<>("OK", "Holdings loaded", portfolioService.portfolio());
    }

    /**
     * §62 · §70 한국투자증권 국내주식 잔고를 가져와 보유종목을 동기화한다.
     * - accountId 는 account_type='invest' 인 계좌여야 한다.
     * - KIS 자격증명은 DB의 kis_account_credentials 에서 조회한다.
     * - 같은 심볼, 또는 심볼 없이 같은 이름으로 입력한 기존 행은 갱신해 중복을 만들지 않는다.
     * - 동기화가 완전히 성공하면(warning == null) 이번 결과에 없는 KIS 출처 행을 삭제한다.
     *   사용자가 직접 입력한 행은 보존한다.
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
        // 단 예수금을 **읽지 못한 0 은 쓰지 않는다** — 계좌가 비어서 0 인 것과
        // API/자격증명 문제로 값을 못 받은 것은 구분할 수 없으므로, 보수적으로
        // 기존 잔액을 유지하고 경고를 돌려준다(§62.3).
        // 채권 잔고 부분 실패 등 서비스가 준 경고를 먼저 싣고, 예수금 미확인 경고는 뒤에 합친다.
        String warning = balance.warning();
        boolean cashKnown = balance.summary() != null && balance.summary().cashKnown();
        BigDecimal cashAmount = balance.summary() == null ? null : balance.summary().dncaTotAmt();
        if (cashKnown) {
            // IRP(상품코드 29) 전용 조회는 예수금 0 도 정상값이다 — 그대로 반영한다.
            long cash = cashAmount == null ? 0L : cashAmount.longValue();
            assetLedger.update(account.id(), account.accountType(), account.name(),
                    account.institutionName(), cash, account.isDebt(), account.openedAt());
            log.info("KIS sync updated cash balance for account {} to {}", account.id(), cash);
        } else if (cashAmount != null && cashAmount.compareTo(BigDecimal.ZERO) > 0) {
            long cash = cashAmount.longValue();
            assetLedger.update(account.id(), account.accountType(), account.name(),
                    account.institutionName(), cash, account.isDebt(), account.openedAt());
            log.info("KIS sync updated cash balance for account {} to {}", account.id(), cash);
        } else {
            String cashWarning = "KIS에서 예수금을 읽지 못해 계좌 잔액을 유지했습니다. "
                    + "App Key/App Secret이 실전·모의 중 어느 용인지, CANO·상품코드·API 환경이 "
                    + "해당 계좌와 맞는지 확인하세요. IRP는 상품코드 29, 개인연금은 22입니다.";
            warning = warning == null || warning.isBlank() ? cashWarning : warning + " | " + cashWarning;
            log.warn("KIS sync could not resolve cash for account {} — keeping balance {}",
                    account.id(), account.balance());
        }

        List<String> syncedSymbols = new ArrayList<>();
        for (KisBalanceResponse.Holding h : balance.holdings()) {
            String symbol = h.pdno();
            if (symbol == null || symbol.isBlank()) {
                continue;
            }
            HoldingRow row = new HoldingRow(
                    0, request.accountId(), h.assetClass(), symbol, h.prdtName(), "KRW",
                    h.hldgQty(), h.pchsAvgPric(), h.prpr(), BigDecimal.ONE, priceAsOf);
            // §70 사용자가 수동으로 넣은 같은 종목이 있으면 그 행을 덮어쓴다.
            ledger.upsertKis(row);
            syncedSymbols.add(symbol);
        }

        // §70 완전히 성공한 경우에만 KIS 에서 사라진 종목을 정리한다.
        // 예수금을 못 읽은 부분 성공에서 지우면 사용자가 입력한 것까지 잃을 수 있다.
        if (warning == null) {
            int removed = ledger.deleteKisOnly(request.accountId(), syncedSymbols);
            if (removed > 0) {
                log.info("KIS sync removed {} stale holding(s) for account {}", removed, request.accountId());
            }
        }

        return new ApiResponse<>("OK", "KIS balance synced",
                warning == null ? portfolioService.portfolio() : portfolioService.withWarning(warning));
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
        if (request.cano() == null || request.cano().isBlank()) {
            throw new IllegalArgumentException("cano is required");
        }
        if (request.acntPrdtCd() == null || request.acntPrdtCd().isBlank()) {
            throw new IllegalArgumentException("acntPrdtCd is required");
        }
        // GET 은 appKey/appSecret 를 마스킹해서 돌려준다. 그 값을 그대로 다시 저장하면
        // 자격증명이 깨진다 — 마스킹 값은 거부하고, 빈 값은 "기존 키 유지"로 받는다.
        String appKey = request.appKey();
        String appSecret = request.appSecret();
        if ((appKey != null && appKey.contains("****"))
                || (appSecret != null && appSecret.contains("****"))) {
            throw new IllegalArgumentException(
                    "마스킹된 키는 저장할 수 없습니다 — 원본 App Key/App Secret을 입력하세요.");
        }
        KisCredentials existing = kisCredentialsService.findDecrypted(accountId);
        if (appKey == null || appKey.isBlank() || appSecret == null || appSecret.isBlank()) {
            if (existing == null) {
                throw new IllegalArgumentException("appKey/appSecret are required");
            }
            if (appKey == null || appKey.isBlank()) appKey = existing.appKey();
            if (appSecret == null || appSecret.isBlank()) appSecret = existing.appSecret();
        }
        KisCredentials plain = new KisCredentials(
                accountId, appKey, appSecret,
                request.baseUrl(), request.cano(), request.acntPrdtCd());
        KisCredentials saved = kisCredentialsService.save(1L, plain);
        return new ApiResponse<>("OK", "KIS credentials saved", kisCredentialsService.mask(saved));
    }

    /** §69 연결 테스트 결과. ok=false 여도 HTTP 200 으로 돌려줘 화면이 사유만 보여 준다. */
    public record KisConnectionTest(boolean ok, Long cash, String message) {}

    /**
     * §69 저장된 자격증명으로 접근토큰 발급 + 잔고 조회를 한 번 수행한다.
     * 잔고를 실제로 반영하지는 않는다 — 키·계좌·환경이 맞는지 먼저 확인하는 용도.
     */
    @PostMapping("/accounts/{accountId}/kis-credentials/test")
    public ApiResponse<KisConnectionTest> testKisCredentials(@PathVariable long accountId) {
        KisCredentials credentials = kisCredentialsService.findDecrypted(accountId);
        if (credentials == null) {
            throw new NotFoundException("KIS credentials not found for account " + accountId);
        }
        try {
            KisBalanceResponse balance = kisBalanceService.fetchBalance(credentials);
            boolean cashKnown = balance.summary() != null && balance.summary().cashKnown();
            BigDecimal cash = balance.summary() == null ? null : balance.summary().dncaTotAmt();
            if (cash == null || (cash.compareTo(BigDecimal.ZERO) <= 0 && !cashKnown)) {
                // 연결은 됐지만 예수금을 못 읽은 경우 — 성공으로 보이면 안 된다.
                return new ApiResponse<>("OK", "KIS connected but cash is unknown",
                        new KisConnectionTest(false, null,
                                "KIS 연결은 되었지만 예수금이 0으로 조회됩니다. "
                                        + "CANO·상품코드가 이 앱키에 등록된 계좌와 맞는지 확인하세요. "
                                        + "IRP는 상품코드 29, 개인연금은 22입니다."));
            }
            return new ApiResponse<>("OK", "KIS connected",
                    new KisConnectionTest(true, cash.longValue(),
                            "KIS 연결 성공 · 예수금 " + cash.longValue() + "원"));
        } catch (KisApiException e) {
            return new ApiResponse<>("OK", "KIS not connected",
                    new KisConnectionTest(false, null, e.getMessage()));
        }
    }

    /**
     * IRP 채권 원본 진단 (읽기 전용). 잔고·현재가 KIS JSON 을 그대로 돌려주며
     * 어떤 계좌/보유종목도 변경하지 않는다. 실패도 200 + error 로 진단 가능하게 한다.
     */
    @PostMapping("/accounts/{accountId}/kis-bond-preview")
    public ApiResponse<KisBalanceService.BondPreview> previewBonds(@PathVariable long accountId) {
        AssetRow account = assetLedger.byId(accountId);
        if (account == null) {
            throw new IllegalArgumentException("account not found: " + accountId);
        }
        if (!"invest".equals(account.accountType())) {
            throw new IllegalArgumentException("account must be an invest account");
        }
        KisCredentials credentials = kisCredentialsService.findDecrypted(account.id());
        if (credentials == null) {
            throw new IllegalArgumentException("KIS credentials not configured for account: " + account.id());
        }
        return new ApiResponse<>("OK", "KIS bond preview", kisBalanceService.previewBonds(credentials));
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

        // BOND-FORM-1: 발행일/만기일은 채권에만 저장한다. 다른 자산군이 보내면 무시(null).
        LocalDate issueDate = parseDate(request.issueDate(), "issueDate");
        LocalDate maturityDate = parseDate(request.maturityDate(), "maturityDate");
        String issuerName = request.issuerName() == null ? null : request.issuerName().trim();
        if (issuerName != null && issuerName.length() > 100) {
            throw new IllegalArgumentException("issuerName must be at most 100 characters");
        }
        BigDecimal couponRate = request.couponRate();
        if (couponRate != null
                && (couponRate.signum() < 0 || couponRate.compareTo(new BigDecimal("100")) > 0)) {
            throw new IllegalArgumentException("couponRate must be between 0 and 100");
        }

        Long faceAmount = request.faceAmount();
        if (faceAmount != null && faceAmount < 0) {
            throw new IllegalArgumentException("faceAmount must not be negative");
        }

        if (!"bond".equals(request.assetClass())) {
            issueDate = null;
            maturityDate = null;
            issuerName = null;
            couponRate = null;
            faceAmount = null;
        } else if (issueDate != null && maturityDate != null && maturityDate.isBefore(issueDate)) {
            throw new IllegalArgumentException("maturityDate must be on or after issueDate");
        }

        return new HoldingRow(0, request.accountId(), request.assetClass(),
                request.symbol() == null || request.symbol().isBlank() ? null : request.symbol(),
                request.name(), currency, request.quantity(), request.avgPrice(),
                request.marketPrice(), request.fxRate(), priceAsOf, issueDate, maturityDate,
                issuerName, couponRate, faceAmount);
    }

    private static LocalDate parseDate(String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(field + " must be YYYY-MM-DD");
        }
    }

    private static void requireNonNegative(BigDecimal value, String field) {
        if (value == null || value.signum() < 0) {
            throw new IllegalArgumentException(field + " must be a non-negative number");
        }
    }
}
