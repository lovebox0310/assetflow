package com.assetflow.expenses;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
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

    public List<Snapshot> recent(String asOf, int months) {
        synchronized (rows) {
            return rows.values().stream()
                    .filter(s -> s.month().compareTo(asOf) <= 0)
                    .sorted((a, b) -> b.month().compareTo(a.month()))
                    .limit(months)
                    .toList();
        }
    }

    public List<Snapshot> between(String from, String to) {
        synchronized (rows) {
            return rows.values().stream()
                    .filter(s -> s.month().compareTo(from) >= 0 && s.month().compareTo(to) <= 0)
                    .sorted((a, b) -> a.month().compareTo(b.month()))
                    .toList();
        }
    }

    public void upsert(Snapshot snapshot) {
        synchronized (rows) {
            rows.put(snapshot.month(), snapshot);
        }
    }
}
