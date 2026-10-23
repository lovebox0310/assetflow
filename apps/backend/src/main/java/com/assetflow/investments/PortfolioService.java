package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 투자 계좌의 총액 계산 (§54.3~§54.4).
 * - 계좌 총액 = 예수금(asset_accounts.balance) + Σ(수량 × 현재가 × 환율)
 * - 저장하지 않는다. 원 단위 HALF_UP 은 계좌 합계에서 1회만 적용한다.
 * 대시보드(§36.2 구성비·§28.7 비상금 분자)와 투자 화면이 같은 값을 소비한다.
 */
@Service
public class PortfolioService {

    public record AccountValue(long accountId, String accountName, String institutionName,
                               long cashBalance, long holdingsValue, long totalValue) {}

    public record Portfolio(List<HoldingRow> holdings, List<AccountValue> accounts) {}

    private final AssetLedger assetLedger;
    private final InvestmentLedger investmentLedger;

    public PortfolioService(AssetLedger assetLedger, InvestmentLedger investmentLedger) {
        this.assetLedger = assetLedger;
        this.investmentLedger = investmentLedger;
    }

    public Portfolio portfolio() {
        List<HoldingRow> holdings = investmentLedger.all();
        Map<Long, BigDecimal> holdingsValueByAccount = new HashMap<>();
        for (HoldingRow h : holdings) {
            holdingsValueByAccount.merge(h.accountId(), value(h), BigDecimal::add);
        }
        List<AccountValue> accounts = assetLedger.all().stream()
                .filter(a -> "invest".equals(a.accountType()))
                .map(a -> {
                    long cash = a.balance();
                    long holdingsValue = toWon(holdingsValueByAccount.getOrDefault(a.id(), BigDecimal.ZERO));
                    return new AccountValue(a.id(), a.name(), a.institutionName(),
                            cash, holdingsValue, cash + holdingsValue);
                })
                .toList();
        return new Portfolio(holdings, accounts);
    }

    /** 대시보드가 invest 행의 value 로 쓸 계좌 총액. 행이 없으면 빈 맵. */
    public Map<Long, Long> totalByAccount() {
        Map<Long, Long> totals = new HashMap<>();
        for (AccountValue account : portfolio().accounts()) {
            totals.put(account.accountId(), account.totalValue());
        }
        return totals;
    }

    /** 평가액 = 수량 × 현재가 × 환율 (원화). 반올림하지 않는다 — 합계에서 1회. */
    public static BigDecimal value(HoldingRow h) {
        return h.quantity().multiply(h.marketPrice()).multiply(h.fxRate());
    }

    /** 원 단위 HALF_UP. §54.4: 행별 반올림 후 합산하지 않는다. */
    public static long toWon(BigDecimal value) {
        return value.setScale(0, RoundingMode.HALF_UP).longValueExact();
    }
}
