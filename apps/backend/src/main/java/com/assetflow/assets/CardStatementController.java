package com.assetflow.assets;

import com.assetflow.common.api.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 카드 명세서 요약 API (§72).
 * 월별 카드 금액을 명세서 이용기간 총액으로 표시하기 위한 데이터를 돌려준다.
 */
@RestController
@RequestMapping("/api/v1/assets")
public class CardStatementController {

    private static final Pattern MONTH_PATTERN = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    private final CardStatementLedger ledger;

    public CardStatementController(CardStatementLedger ledger) {
        this.ledger = ledger;
    }

    @GetMapping("/card-imports/statements")
    public ApiResponse<List<CardStatementLedger.StatementRow>> statements(
            @RequestParam("from") String from,
            @RequestParam("to") String to) {
        if (!MONTH_PATTERN.matcher(from).matches() || !MONTH_PATTERN.matcher(to).matches()) {
            throw new IllegalArgumentException("from/to must be YYYY-MM");
        }
        if (from.compareTo(to) > 0) {
            throw new IllegalArgumentException("from must be earlier than or equal to to");
        }
        long months = ChronoUnit.MONTHS.between(YearMonth.parse(from), YearMonth.parse(to)) + 1;
        if (months > 36) {
            throw new IllegalArgumentException("range must be 36 months or fewer");
        }
        return new ApiResponse<>("OK", "Card statements loaded", ledger.inRange(from, to));
    }
}
