package com.assetflow.assets;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 카드매입 원장의 인메모리 구현. postgres 프로필이 아닌 환경(테스트·CI)의 기본값. */
@Component
@Profile("!postgres")
public class InMemoryCardImportLedger implements CardImportLedger {

    private final List<ImportedRow> rows = new ArrayList<>();

    public List<ImportedRow> all() {
        synchronized (rows) {
            return List.copyOf(rows);
        }
    }

    public Set<String> existingRowKeys() {
        synchronized (rows) {
            Set<String> keys = new HashSet<>();
            for (ImportedRow r : rows) keys.add(r.rowKey());
            return keys;
        }
    }

    public int addAll(List<ImportedRow> incoming) {
        int stored = 0;
        synchronized (rows) {
            Set<String> keys = new HashSet<>();
            for (ImportedRow r : rows) keys.add(r.rowKey());
            for (ImportedRow r : incoming) {
                if (keys.add(r.rowKey())) {
                    rows.add(r);
                    stored++;
                }
            }
        }
        return stored;
    }
}
