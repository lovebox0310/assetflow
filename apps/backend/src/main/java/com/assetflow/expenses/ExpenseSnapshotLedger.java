package com.assetflow.expenses;

import java.util.List;

/** 월 스냅샷 원장 계약 (§44 — 수입 입력·월 확정의 저장처, §37 monthly_snapshots). */
public interface ExpenseSnapshotLedger {

    record Snapshot(String month, long totalAssets, long totalDebts,
                    long income, long expenses, long essentialExpenses, boolean essentialComplete) {}

    /** 없으면 null — 월 미확정 상태(§37: 스냅샷은 시점값, 중복 스냅샷은 UPDATE). */
    Snapshot get(String month);

    /**
     * asOf 월 이하의 최근 months 개 스냅샷을 최신 월부터 반환.
     * 스냅샷이 없으면 빈 리스트 — 호출 측이 폴다운 결정(§34.6).
     */
    List<Snapshot> recent(String asOf, int months);

    void upsert(Snapshot snapshot);
}
