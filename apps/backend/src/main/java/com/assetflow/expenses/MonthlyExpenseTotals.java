package com.assetflow.expenses;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.CardStatementLedger;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * 지출 합계의 단일 출처.
 *
 * <p>월 확정 스냅샷의 {@code expenses} 는 확정 시점값이라, 이후 카드내역(CSV 반영·정리)이
 * 바뀌어도 갱신되지 않는다. 그래서 지출은 <b>조회 시점의 원장 행</b>에서 계산한다 —
 * 월 확정 여부와 무관하게 계산 가능해야 한다.</p>
 *
 * <pre>
 * card(month)      = Σ 카드사별 (그 카드사의 billing 명세서 합계 &gt; 0 ? 그 금액
 *                                                              : 그 카드사의 승인일 합계)
 * expenses(month)  = card(month) + Σ monthly_expense_items.amount(그 달)
 * essential(month) = Σ monthly_expense_items.amount where is_essential
 * </pre>
 *
 * <p>§72: 카드사 청구액은 승인일 달력 월 합계와 다르다(청구 주기 경계·취소 부호·중복).
 * 그래서 명세서 요약이 있으면 그 총액을 월 카드 금액으로 쓴다. 없으면 승인일 합계로
 * 폴백하되, {@link Totals#cardSource()} 로 <b>추정</b>임을 드러낸다 — 화면이 숨기지 않는다.</p>
 *
 * <p>이슈 #56: 판단은 <b>카드사별</b>이다. 종전에는 월 단위로 "명세서가 하나라도 있으면
 * 승인일 합계 전체를 버렸다" — 2026-09 처럼 삼성만 명세서가 있고 현대는 없는 달에
 * 현대 승인액이 통째로 사라졌다. 이제 카드사 집합(명세서 카드사 ∪ 승인일 카드사)을 만들고,
 * 카드사마다 명세서가 있으면 그 금액, 없으면 <b>그 카드사의</b> 승인일 합계를 더한다.
 * 일부만 명세서면 {@link #CARD_SOURCE_MIXED} 로 혼합임을 드러낸다.</p>
 *
 * <p><b>usage_month 해석</b>: 명세서의 {@code usage_month} 는 이용기간 <b>시작 월</b>이다
 * (§72 데이터 규칙). 예: 현대 10/02~11/03 → {@code 2026-10}, 삼성 9/3~10/2 → {@code 2026-09}.
 * 사용자가 "2026-10 카드 금액"으로 보는 값이 그 달 청구서 총액이므로, 달력 월이 아니라
 * 이용기간 시작 월로 버킷한다. 이 규칙은 저장 시점({@code VestMail*Importer})과 같다.</p>
 *
 * <p>§34.6 계산 중복 금지: 대시보드·지출 스냅샷 API 가 모두 이 클래스를 쓴다.</p>
 *
 * <p>이슈 #51: 종전에는 승인일 합계만 썼기 때문에 2026-10 화면 금액이 실제 청구액과
 * 달랐다. 카드 금액만 명세서 기준으로 바꾸고, 항목 합산·필수지출 계산은 그대로 둔다.</p>
 */
@Service
public class MonthlyExpenseTotals {

    /** 카드 금액이 명세서(billing) 합계와 같다 — 저장된 청구서가 그 달에 있다. */
    public static final String CARD_SOURCE_STATEMENT = "statement";
    /** 명세서가 없어 승인일 합계로 폴백했다 — 화면은 이 값을 "추정"으로 표시한다. */
    public static final String CARD_SOURCE_APPROVAL = "approval";
    /**
     * 일부 카드사만 명세서가 있어, 그 카드사는 명세서 금액·나머지는 승인일 합계로 더했다.
     * 화면은 이 값을 "일부 추정"으로 표시한다(이슈 #56).
     */
    public static final String CARD_SOURCE_MIXED = "mixed";

    /** 카드사 이름이 비었을 때의 묶음 키 — {@code CardImportController} 의 표기와 같다. */
    private static final String UNKNOWN_CARD_COMPANY = "미확인";

    /**
     * @param expenses          월 총지출 = 카드 금액 + 월 지출 항목
     * @param essential         월 필수지출(항목만 — 카드 행에는 필수 여부가 없다)
     * @param cardSpend         지출에 실제로 더한 카드 금액(카드사별 명세서 또는 승인일 합계)
     * @param cardSource        {@link #CARD_SOURCE_STATEMENT} · {@link #CARD_SOURCE_APPROVAL} ·
     *                          {@link #CARD_SOURCE_MIXED}
     * @param cardStatementTotal 그 달에 실제로 쓴 billing 명세서 합계(승인일로 폴백한 카드사는 제외)
     * @param statementCount    그 달 billing 명세서 건수(카드사별 1건씩)
     */
    public record Totals(long expenses, long essential, long cardSpend, String cardSource,
                         long cardStatementTotal, int statementCount) {}

    /** 명세서 종류 중 월 금액에 쓰는 것 — 정기 청구서. {@code detail} 은 기간 한정 상세내역서다. */
    private static final String BILLING = "billing";

    private final CardImportLedger cardLedger;
    private final ExpenseItemLedger expenseLedger;
    private final CardStatementLedger statementLedger;

    public MonthlyExpenseTotals(CardImportLedger cardLedger, ExpenseItemLedger expenseLedger,
                                CardStatementLedger statementLedger) {
        this.cardLedger = cardLedger;
        this.expenseLedger = expenseLedger;
        this.statementLedger = statementLedger;
    }

    /** @param month "YYYY-MM" (명세서는 usage_month = 이용기간 시작 월과 맞춘다) */
    public Totals compute(String month) {
        // inRange(month, month): usage_month 가 정확히 그 달인 행만. 카드사가 둘이면 두 행이 온다.
        Map<String, Long> statementByCompany = new LinkedHashMap<>();
        int statementCount = 0;
        for (CardStatementLedger.StatementRow s : statementLedger.inRange(month, month)) {
            // kind='detail'(이용상세내역서)은 기간을 지정해 요청한 것이라 월 전체를 대표하지 않는다.
            if (!BILLING.equals(s.kind())) {
                continue;
            }
            statementByCompany.merge(companyOf(s.cardCompany()), s.totalAmount(), Long::sum);
            statementCount += 1;
        }

        Map<String, Long> approvalByCompany = new LinkedHashMap<>();
        for (CardImportLedger.ImportedRow r : cardLedger.inMonth(month)) {
            approvalByCompany.merge(companyOf(r.cardCompany()), r.grossAmount(), Long::sum);
        }

        // 카드사 집합 = 명세서 카드사 ∪ 승인일 카드사. 승인액이 0 인 카드사도 키가 있으면 센다.
        Set<String> companies = new LinkedHashSet<>(statementByCompany.keySet());
        companies.addAll(approvalByCompany.keySet());

        long cardSpend = 0;
        // cardStatementTotal 은 승인일로 폴백한 카드사를 빼야 cardSpend 의 내역과 맞는다.
        long statementUsedTotal = 0;
        int statementCompanies = 0;
        for (String company : companies) {
            long statementAmount = statementByCompany.getOrDefault(company, 0L);
            if (statementAmount > 0) {
                cardSpend += statementAmount;
                statementUsedTotal += statementAmount;
                statementCompanies += 1;
            } else {
                // 이 카드사에는 이 달 명세서가 없다 — 그 카드사의 승인일 합계로만 더한다.
                cardSpend += approvalByCompany.getOrDefault(company, 0L);
            }
        }
        String cardSource = sourceOf(companies.size(), statementCompanies);

        long itemSpend = 0;
        long essential = 0;
        for (ExpenseItemLedger.ExpenseItem it : expenseLedger.all(month)) {
            itemSpend += it.amount();
            if (it.isEssential()) {
                essential += it.amount();
            }
        }
        return new Totals(cardSpend + itemSpend, essential, cardSpend, cardSource, statementUsedTotal, statementCount);
    }

    /**
     * 카드사 금액의 출처 판정.
     *
     * <ul>
     *   <li>카드사 0개(카드 데이터 없음) → approval (기존 동작 유지)</li>
     *   <li>모든 카드사가 명세서 → statement</li>
     *   <li>명세서 카드사가 하나도 없음 → approval</li>
     *   <li>그 외(일부만 명세서) → mixed</li>
     * </ul>
     */
    private static String sourceOf(int companyCount, int statementCompanies) {
        if (companyCount == 0 || statementCompanies == 0) {
            return CARD_SOURCE_APPROVAL;
        }
        return statementCompanies == companyCount ? CARD_SOURCE_STATEMENT : CARD_SOURCE_MIXED;
    }

    /** 카드사 이름이 비면 하나의 묶음("미확인")으로 센다 — 업로드 규칙과 같은 표기. */
    private static String companyOf(String cardCompany) {
        return cardCompany == null || cardCompany.isBlank() ? UNKNOWN_CARD_COMPANY : cardCompany;
    }
}
