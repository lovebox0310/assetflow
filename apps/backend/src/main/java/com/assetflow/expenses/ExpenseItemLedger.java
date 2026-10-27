package com.assetflow.expenses;

import java.util.List;

/**
 * 월 지출 항목 원장 계약 (§43 — 스프린트 3 지출 화면의 원장).
 * §39 패턴 반복: postgres 프로필에서 Postgres 구현, 그 밖(테스트·CI)은 InMemory.
 * §34.6: 합계·필수지출 합계는 여기서 만들지 않는다 — 행만 보관한다.
 */
public interface ExpenseItemLedger {

    /**
     * @param category §57.6 대분류(9개) — 지출 추이에 포함할 분류. null 이면 추이에서 뺀다
     *                 (카드대금처럼 지출이 아닌 항목의 이중계상을 막는다).
     */
    record ExpenseItem(long id, String month, String label,
                       long amount, boolean isEssential, long purchaseVat, Long recurringId,
                       String category) {}

    /** §57.6 추이 집계 행 — category 가 null 인 항목은 포함하지 않는다. */
    record MonthlyItemTotal(String month, String category, long gross) {}

    List<ExpenseItem> all(String month);

    /** §45.2: 그 월에 아직 없는 정기 항목을 멱등하게 물리행으로 등록한다(이미 있으면 무시). */
    void ensureRecurringRows(String month, List<com.assetflow.expenses.RecurringExpenseLedger.Recurring> defs);

    /** §45.5: 월 항목을 정기 정의에 연결(recurring_id 세팅) — 변환 후 "정기 항목 수정" 링크가 붙는다. */
    void linkRecurring(long id, Long recurringId);

    /**
     * §45.2 개정: 정기 항목 이름 변경을 연결된 월 행에 소급한다.
     * 기존 oldLabel 과 연결된 행만 이름을 바꾸며, 금액·필수·세액은 그 달의 시점값으로 유지한다.
     * 다른 행과 같은 이름이 충돌하면 IllegalArgumentException 을 던진다.
     */
    void renameRecurringRows(long recurringId, String oldLabel, String newLabel);

    /**
     * §45.2 개정: 정기 항목의 금액·필수·세액 변경을, 아직 수동으로 바꾸지 않은 연결 행에 소급한다.
     * '수동으로 바꾸지 않았다'는 기준은 amount·isEssential·purchaseVat 이 모두 old 값과 같을 때다.
     */
    void updateRecurringRows(long recurringId,
                             long oldAmount, boolean oldEssential, long oldPurchaseVat,
                             long newAmount, boolean newEssential, long newPurchaseVat);

    /** §45.3: from 월의 항목을 to 월로 복사(중복 label 은 걸러뜀) — 복사된 건수. */
    int copyMonth(String from, String to);

    /**
     * §57.6: 정기 정의의 대분류 변경을, 아직 수동으로 바꾸지 않은 연결 행에 소급한다.
     * '수동으로 바꾸지 않았다'는 기준은 category 가 old 값과 같을 때다.
     */
    void updateRecurringCategory(long recurringId, String oldCategory, String newCategory);

    /** §57.6: from~to(양끝 포함) 월별·대분류별 항목 합계. category 가 없는 행은 뺀다. */
    List<MonthlyItemTotal> monthlyCategoryTotals(String from, String to);

    /** 없으면 null — PUT 의 월 유지 판단용. */
    ExpenseItem byId(long id);

    ExpenseItem create(String month, String label, long amount, boolean isEssential, long purchaseVat, String category);

    ExpenseItem update(long id, String month, String label, long amount, boolean isEssential, long purchaseVat, String category);

    void delete(long id);
}
