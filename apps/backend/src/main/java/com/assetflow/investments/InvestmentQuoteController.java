package com.assetflow.investments;

import com.assetflow.common.api.ApiResponse;
import com.assetflow.common.api.NotFoundException;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import com.assetflow.investments.PortfolioService.Portfolio;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * 투자 시세 API (§54.4) — 현재가는 저장값이 아니라 조회값이다.
 *
 * - GET  /api/v1/investments/quotes?symbol=005930  → 종목 1건 시세(종목 추가 폼)
 * - GET  /api/v1/investments/fx?currency=USD       → 환율(통화가 USD 일 때만)
 * - POST /api/v1/investments/quotes/refresh        → 전체 보유종목 현재가 갱신 후 포트폴리오
 *
 * 조회 실패는 404 로 돌려준다 — 화면은 저장된 현재가를 그대로 두고 안내만 한다.
 * 갱신은 통화가 일치하는 종목만 반영한다(원화 종목에 달러 시세를 넣으면 평가액이 깨진다).
 */
@RestController
@RequestMapping("/api/v1/investments")
public class InvestmentQuoteController {

    private final QuoteService quotes;
    private final InvestmentLedger ledger;
    private final PortfolioService portfolioService;

    public InvestmentQuoteController(QuoteService quotes, InvestmentLedger ledger,
                                     PortfolioService portfolioService) {
        this.quotes = quotes;
        this.ledger = ledger;
        this.portfolioService = portfolioService;
    }

    @GetMapping("/quotes")
    public ApiResponse<QuoteService.Quote> quote(@RequestParam(required = false) String symbol) {
        if (symbol == null || symbol.isBlank()) {
            throw new IllegalArgumentException("symbol is required");
        }
        return new ApiResponse<>("OK", "Quote loaded", quotes.quote(symbol)
                .orElseThrow(() -> new NotFoundException("quote for " + symbol)));
    }

    @GetMapping("/fx")
    public ApiResponse<QuoteService.FxRate> fxRate(
            @RequestParam(defaultValue = "USD") String currency) {
        String code = currency == null ? "USD" : currency.trim().toUpperCase(Locale.ROOT);
        return new ApiResponse<>("OK", "Fx rate loaded", quotes.fxRate(code)
                .orElseThrow(() -> new NotFoundException("fx rate for " + code)));
    }

    @PostMapping("/quotes/refresh")
    public ApiResponse<Portfolio> refresh() {
        List<HoldingRow> updates = ledger.all().parallelStream()
                .map(this::withQuote)
                .flatMap(Optional::stream)
                .toList();
        updates.forEach(row -> ledger.update(row.id(), row));
        return new ApiResponse<>("OK", "Prices refreshed", portfolioService.portfolio());
    }

    private Optional<HoldingRow> withQuote(HoldingRow holding) {
        if (holding.symbol() == null || holding.symbol().isBlank()) return Optional.empty();
        if ("crypto".equals(holding.assetClass())) return Optional.empty(); // 네이버에 코인 시세가 없다
        return quotes.quote(holding.symbol())
                .filter(q -> q.price() != null && q.price().signum() > 0)
                .filter(q -> q.currency() != null
                        && q.currency().equalsIgnoreCase(holding.currency()))
                .map(q -> new HoldingRow(holding.id(), holding.accountId(), holding.assetClass(),
                        holding.symbol(), holding.name(), holding.currency(), holding.quantity(),
                        holding.avgPrice(), q.price(), holding.fxRate(), q.priceAsOf()));
    }
}
