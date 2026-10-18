package com.assetflow.expenses;

import java.util.List;

/**
 * 월 지출 항목 원장 계약 (§43 — 스프린트 3 지출 화면의 원장).
 * §39 패턴 반복: postgres 프로필에서 Postgres 구현, 그 밖(테스트·CI)은 InMemory.
 * §34.6: 합계·필수지출 합계는 여기서 만들지 않는다 — 행만 보관한다.
 */
public interface ExpenseItemLedger {

    record ExpenseItem(long id, String month, String label,
                       long amount, boolean isEssential, long purchaseVat) {}

    List<ExpenseItem> all(String month);

    /** 없으면 null — PUT 의 월 유지 판단용. */
    ExpenseItem byId(long id);

    ExpenseItem create(String month, String label, long amount, boolean isEssential, long purchaseVat);

    ExpenseItem update(long id, String month, String label, long amount, boolean isEssential, long purchaseVat);

    void delete(long id);
}
