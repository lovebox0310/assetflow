package com.assetflow.dashboard;

import java.time.YearMonth;
import java.util.List;

/**
 * 리포지토리 자리의 mock 원장 (Issue 5 스키마가 DB 로 이어지기 전까지).
 * 값은 §36.2 mock 기준선(프론트 dashboardMock.ts)과 동일해야 테스트가 양쪽에서
 * 같은 기준을 본다. 계산(순자산·구성비 등)은 여기서 하지 않는다 — 계산 단일
 * 출처는 프론트 metrics.ts 다 (§34.6). 서버는 행(로우)만 내려준다.
 */
public final class MockDashboardSource {

    /**
     * @param value   화면 표시용 계좌 가치 — invest 는 예수금 + 보유종목 평가액(§54.3).
     * @param balance 예수금(원장 잔액). invest 라도 평가액을 뺀 현금성 금액이다 —
     *                비상금 분자는 이 값을 쓴다(§62: 주가 변동을 비상금에 섞지 않는다).
     */
    public record AssetRow(String id, String type, String name, long value, long balance) {}
    public record LiabilityRow(String id, String name, long balance) {}
/**
     * @param vatSetAside 부가세통장 적립 이체(§57.9) — 지출이 아님.
     * @param balance     그 달 수지 = income - vatSetAside - expenses.
     * @param cardSource  이슈 #51·#56 — 카드 금액 출처("statement"|"approval"|"mixed"). 모크 기준선은 카드
     *                    원장을 읽지 않으므로 null 이다 — 화면은 null 을 "표시 없음"으로 본다.
     * @param cardStatementTotal 그 달 billing 명세서 합계(모크는 0).
     * @param statementCount     그 달 billing 명세서 건수(모크는 0).
     */
    public record MonthlySummary(long income, long vatSetAside, long expenses, long essentialExpenses,
                                 boolean essentialComplete, long balance,
                                 String cardSource, long cardStatementTotal, int statementCount) {}
    /**
     * @param vatSetAside 부가세통장 적립 이체(§57.9) — 지출이 아님.
     * @param balance     그 달 수지 = income - vatSetAside - expenses.
     */
    public record CashflowMonth(String month, long income, long vatSetAside, long expenses, long balance) {}

    /**
     * 이슈 #57: <b>모크 기준선 데이터의 라벨</b>일 뿐이다 — "오늘"이 아니다.
     * 현재 월은 {@code DashboardService.currentMonth(Clock)} 이 주입된 시계에서 계산한다.
     * 이름을 {@code AS_OF} 로 두면 다시 "이번 달"로 오용되기 쉬워 기준선 라벨임을 이름에 박았다.
     */
    public static final String BASELINE_MONTH = "2026-10";

    /** §37 원장이 자산 행의 유일한 출처이다 — assets()/liabilities() 시드 중복은 제거(§31.1). */

    public static MonthlySummary monthly() {
        // §36.2 기준선과 동일: 총수입 820.0만, 부가세 0, 지출 496.0만, 필수 2,317,180, 수지 324.0만
        // 이슈 #57: 이 값은 BASELINE_MONTH(과거) 기준선이다 — 이번 달 스냅샷이 없을 때의 데모 폴백일 뿐,
        // "이번 달 실적"이 아니다. 현재 월 라벨은 DashboardService 가 Clock 으로 붙인다.
        // 카드 금액 출처는 null — 모크는 카드 원장·명세서를 읽지 않는다(화면은 배지를 그리지 않는다).
        return new MonthlySummary(8_200_000L, 0L, 4_960_000L, 2_317_180L, true, 3_240_000L, null, 0L, 0);
    }

    /**
     * 최근 월 순(desc). {@link #BASELINE_MONTH} 는 기준선, 이전 월은 연동 데모용 가짜 값.
     *
     * <p>이슈 #57: 실데이터(스냅샷)가 하나도 없을 때만 쓰이는 폴백이다. 달력 월을 계산하지
     * 않으므로 반환되는 최신 월은 <b>과거 고정값({@link #BASELINE_MONTH})</b> 이다 — 화면은 이 값을
     * "이번 달"로 읽지 않아야 한다. 현재 월은 {@code DashboardService.currentMonth(Clock)} 이 정한다.</p>
     */
    public static List<CashflowMonth> cashflow() {
        // 이슈 #57: 월 라벨은 BASELINE_MONTH 에서 거슬러 계산한다 — "2026-09" 같은 문자열을
        // 흩어 두면 실제 확정 월로 오독되기 쉽다. 값 자체는 §36.2 데모 기준선 그대로다.
        YearMonth base = YearMonth.parse(BASELINE_MONTH);
        return List.of(
                row(base, 8_200_000L, 4_960_000L, 3_240_000L),
                row(base.minusMonths(1), 7_950_000L, 5_310_000L, 2_640_000L),
                row(base.minusMonths(2), 8_200_000L, 4_720_000L, 3_480_000L),
                row(base.minusMonths(3), 7_600_000L, 5_050_000L, 2_550_000L),
                row(base.minusMonths(4), 8_200_000L, 4_880_000L, 3_320_000L),
                row(base.minusMonths(5), 7_950_000L, 5_240_000L, 2_710_000L));
    }

    /** 모크 행 — 부가세통장 이체는 기준선에서 0 이다(§57.9). */
    private static CashflowMonth row(YearMonth month, long income, long expenses, long balance) {
        return new CashflowMonth(month.toString(), income, 0L, expenses, balance);
    }

    private MockDashboardSource() {}
}
