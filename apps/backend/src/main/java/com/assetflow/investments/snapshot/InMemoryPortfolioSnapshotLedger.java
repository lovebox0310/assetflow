package com.assetflow.investments.snapshot;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 테스트·비 postgres 프로필용 스냅샷 원장. */
@Component
@Profile("!postgres")
public class InMemoryPortfolioSnapshotLedger implements PortfolioSnapshotLedger {

    private final Map<Long, List<Snapshot>> rows = new LinkedHashMap<>();

    @Override
    public synchronized void save(long userId, Snapshot snapshot) {
        rows.computeIfAbsent(userId, k -> new ArrayList<>()).add(snapshot);
    }

    @Override
    public synchronized List<Snapshot> range(long userId, LocalDate from, LocalDate to) {
        return rows.getOrDefault(userId, List.of()).stream()
                .filter(s -> !s.takenOn().isBefore(from) && !s.takenOn().isAfter(to))
                .toList();
    }
}
