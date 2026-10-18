package com.assetflow.assets;

import java.util.List;
import java.util.Set;

/**
 * 카드매입 원장 계약 — 임포트 확정 행의 저장처. §29.2: FE 미리보기는 참고고,
 * 이 원장에 들어가는 값은 서버가 재검증해 확정한다. §29.7: 합계는 저장하지 않는다 —
 * 행에서 재계산해 돌려준다. (지출 도메인이 이 데이터를 소비한다 — 스프린트 3 화면 창구)
 */
public interface CardImportLedger {

    record ImportedRow(String rowKey, String approvedAt, String merchantName,
                       long supplyExVat, long vat, long grossAmount,
                       String cardMasked, String expenseKind) {}

    List<ImportedRow> all();

    Set<String> existingRowKeys();

    /** 이미 있는 rowKey 는 건너뛴다(§29.6 중복 반영 금지). 새로 저장된 건수를 돌려준다. */
    int addAll(List<ImportedRow> incoming);
}
