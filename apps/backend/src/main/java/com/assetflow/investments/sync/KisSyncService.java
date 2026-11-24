package com.assetflow.investments.sync;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.investments.InvestmentLedger;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import com.assetflow.investments.PortfolioService;
import com.assetflow.investments.PortfolioService.Portfolio;
import com.assetflow.investments.kis.KisBalanceResponse;
import com.assetflow.investments.kis.KisBalanceService;
import com.assetflow.investments.kis.KisCredentials;
import com.assetflow.investments.kis.KisCredentialsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * KIS 잔고 동기화 (이슈 #58 에서 컨트롤러에서 추출).
 *
 * <p>자동 동기화(#58)가 같은 로직을 재사용해야 해서 서비스로 옮겼다.
 * <b>동작은 컨트롤러에 있던 것과 같다</b> — 예수금을 읽지 못한 0 을 쓰지 않고,
 * 경고가 없을 때만(완전 성공) KIS 출처 행을 정리한다(§62.3, §70).</p>
 */
@Service
public class KisSyncService {

    private static final Logger log = LoggerFactory.getLogger(KisSyncService.class);

    private final InvestmentLedger ledger;
    private final AssetLedger assetLedger;
    private final PortfolioService portfolioService;
    private final KisBalanceService kisBalanceService;
    private final KisCredentialsService kisCredentialsService;

    public KisSyncService(InvestmentLedger ledger, AssetLedger assetLedger,
                          PortfolioService portfolioService,
                          KisBalanceService kisBalanceService,
                          KisCredentialsService kisCredentialsService) {
        this.ledger = ledger;
        this.assetLedger = assetLedger;
        this.portfolioService = portfolioService;
        this.kisBalanceService = kisBalanceService;
        this.kisCredentialsService = kisCredentialsService;
    }

    /** 계좌 검증까지 포함한 동기화. 계좌가 없거나 invest 가 아니면 예외. */
    public Portfolio sync(long accountId) {
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

        KisBalanceResponse balance = kisBalanceService.fetchBalance(credentials);
        String priceAsOf = LocalDate.now().toString();

        // §62 CMA 계좌처럼 보유종목은 없고 현금만 있는 경우, 예수금도 동기화한다.
        // 단 예수금을 **읽지 못한 0 은 쓰지 않는다** — 계좌가 비어서 0 인 것과
        // API/자격증명 문제로 값을 못 받은 것은 구분할 수 없으므로, 보수적으로
        // 기존 잔액을 유지하고 경고를 돌려준다(§62.3).
        String warning = balance.warning();
        boolean cashKnown = balance.summary() != null && balance.summary().cashKnown();
        BigDecimal cashAmount = balance.summary() == null ? null : balance.summary().dncaTotAmt();
        if (cashKnown) {
            // IRP(상품코드 29) 전용 조회는 예수금 0 도 정상값이다 — 그대로 반영한다.
            long cash = cashAmount == null ? 0L : cashAmount.longValue();
            updateCash(account, cash);
            log.info("KIS sync updated cash balance for account {} to {}", account.id(), cash);
        } else if (cashAmount != null && cashAmount.compareTo(BigDecimal.ZERO) > 0) {
            long cash = cashAmount.longValue();
            updateCash(account, cash);
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
                    0, accountId, h.assetClass(), symbol, h.prdtName(), "KRW",
                    h.hldgQty(), h.pchsAvgPric(), h.prpr(), BigDecimal.ONE, priceAsOf);
            // §70 사용자가 수동으로 넣은 같은 종목이 있으면 그 행을 덮어쓴다.
            ledger.upsertKis(row);
            syncedSymbols.add(symbol);
        }

        // §70 완전히 성공한 경우에만 KIS 에서 사라진 종목을 정리한다.
        // 예수금을 못 읽은 부분 성공에서 지우면 사용자가 입력한 것까지 잃을 수 있다.
        if (warning == null) {
            int removed = ledger.deleteKisOnly(accountId, syncedSymbols);
            if (removed > 0) {
                log.info("KIS sync removed {} stale holding(s) for account {}", removed, accountId);
            }
        }

        return warning == null ? portfolioService.portfolio() : portfolioService.withWarning(warning);
    }

    private void updateCash(AssetRow account, long cash) {
        assetLedger.update(account.id(), account.accountType(), account.name(),
                account.institutionName(), cash, account.isDebt(), account.openedAt());
    }
}
