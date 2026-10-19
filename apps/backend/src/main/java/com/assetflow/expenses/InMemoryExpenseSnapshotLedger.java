package com.assetflow.expenses;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/** 월 스냅샷 원장의 인메모리 구현 (테스트·CI). */
@Component
@Profile("!postgres")
public class InMemoryExpenseSnapshotLedger implements ExpenseSnapshotLedger {

    private final Map<String, Snapshot> rows = new HashMap<>();

    public Snapshot get(String month) {
        synchronized (rows) {
            return rows.get(month);
        }
    }

    public void upsert(Snapshot snapshot) {
        synchronized (rows) {
            rows.put(snapshot.month(), snapshot);
        }
    }
}
