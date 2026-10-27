package com.assetflow.expenses;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/** 월 스냅샷 원장 계약 (§44 — 수입 입력·월 확정의 저장처, §37 monthly_snapshots). */
public interface ExpenseSnapshotLedger {

    /**
     * @param vatSetAside 부가세통장 적립 이체 — 지출이 아닌 수입 차감 항목(§57.9).
     */
    record Snapshot(String month, long totalAssets, long totalDebts,
                    long income, long vatSetAside, long expenses, long essentialExpenses, boolean essentialComplete) {
        /** 수지 = income - vatSetAside - expenses (§57.9). */
        @JsonProperty("balance")
        public long balance() {
            return income - vatSetAside - expenses;
        }
    }

    /** 없으면 null — 월 미확정 상태(§37: 스냅샷은 시점값, 중복 스냅샷은 UPDATE). */
    Snapshot get(String month);

    /**
     * asOf 월 이하의 최근 months 개 스냅샷을 최신 월부터 반환.
     * 스냅샷이 없으면 빈 리스트 — 호출 측이 폴다운 결정(§34.6).
     */
    List<Snapshot> recent(String asOf, int months);

    /**
     * from~to(YYYY-MM, 양끝 포함) 구간의 스냅샷을 오래된 월부터 반환.
     * 스냅샷이 없는 달은 결과에 없다 — 호출 측이 "미확정"으로 드러낸다(§34.6).
     */
    List<Snapshot> between(String from, String to);

    void upsert(Snapshot snapshot);
}
