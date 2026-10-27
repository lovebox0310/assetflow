package com.assetflow.expenses;

import java.util.List;

/**
 * 정기(고정) 지출 정의 원장 계약 (§45 — issue 48). 기간 밖의 월에는 등록되지 않는다.
 * 월 표의 자동 등록은 "읽을 때 멱등 물리행 생성"(§45.2) — 원장 자체는 약속만 보관.
 */
public interface RecurringExpenseLedger {

    record Recurring(long id, String label, long amount, boolean isEssential, long purchaseVat,
                     String startMonth, String endMonth, String category) {}

    /** 전체 정의 (관리 화면용). */
    List<Recurring> all();

    /** 해당 월에 활성인 정의 (start <= month <= end 또는 무기한). */
    List<Recurring> activeIn(String month);

    Recurring create(String label, long amount, boolean isEssential, long purchaseVat,
                     String startMonth, String endMonth, String category);

    Recurring update(long id, String label, long amount, boolean isEssential, long purchaseVat,
                     String startMonth, String endMonth, String category);

    void delete(long id);
}
