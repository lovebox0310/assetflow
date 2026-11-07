package com.assetflow.assets;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/** 인메모리 명세서 요약 원장 (§72). 테스트·CI 기본값. */
@Component
@Profile("!postgres")
public class InMemoryCardStatementLedger implements CardStatementLedger {

    private final List<StatementRow> rows = new ArrayList<>();
    private final AtomicLong nextId = new AtomicLong(1);

    @Override
    public List<StatementRow> inRange(String fromMonth, String toMonth) {
        synchronized (rows) {
            return rows.stream()
                    .filter(r -> r.usageMonth().compareTo(fromMonth) >= 0
                            && r.usageMonth().compareTo(toMonth) <= 0)
                    .sorted((a, b) -> {
                        int byMonth = a.usageMonth().compareTo(b.usageMonth());
                        return byMonth != 0 ? byMonth : a.cardCompany().compareTo(b.cardCompany());
                    })
                    .toList();
        }
    }

    @Override
    public void upsert(StatementRow row) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                StatementRow current = rows.get(i);
                if (current.cardCompany().equals(row.cardCompany())
                        && current.periodStart().equals(row.periodStart())
                        && current.periodEnd().equals(row.periodEnd())) {
                    rows.set(i, new StatementRow(current.id(), row.cardCompany(), row.kind(),
                            row.usageMonth(), row.periodStart(), row.periodEnd(), row.totalAmount()));
                    return;
                }
            }
            rows.add(new StatementRow(nextId.getAndIncrement(), row.cardCompany(), row.kind(),
                    row.usageMonth(), row.periodStart(), row.periodEnd(), row.totalAmount()));
        }
    }
}
