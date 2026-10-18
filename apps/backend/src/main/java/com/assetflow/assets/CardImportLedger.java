package com.assetflow.assets;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 카드매입 원장 — 임포트 확정 행의 저장처(모크, §39 단일 교체 지점).
 * §29.2: FE 미리보기는 참고고, 이 원장에 들어가는 값은 서버가 재검증해 확정한다.
 * §29.7: 합계는 저장하지 않는다 — 행에서 재계산해 돌려준다.
 * (지출 도메인이 이 데이터를 소비한다 — 스프린트 3 화면 창구)
 */
@Component
public class CardImportLedger {

    public record ImportedRow(String rowKey, String approvedAt, String merchantName,
                              long supplyExVat, long vat, long grossAmount,
                              String cardMasked, String expenseKind) {}

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

    /** 이미 있는 rowKey 는 건너뛴다(§29.6 중복 반영 금지). 새로 저장된 건수를 돌려준다. */
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
