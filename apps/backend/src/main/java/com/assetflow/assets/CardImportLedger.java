package com.assetflow.assets;

import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 카드매입 원장 계약 — 임포트 확정 행의 저장처. §29.2: FE 미리보기는 참고고,
 * 이 원장에 들어가는 값은 서버가 재검증해 확정한다. §29.7: 합계는 저장하지 않는다 —
 * 행에서 재계산해 돌려준다. (지출 도메인이 이 데이터를 소비한다 — 스프린트 3 화면 창구)
 */
public interface CardImportLedger {

    /** §55.10: expenseKind = 대분류, subCategory = 세부 분류. */
    record ImportedRow(String rowKey, String approvedAt, String merchantName,
                       long supplyExVat, long vat, long grossAmount,
                       String cardMasked, String expenseKind, String subCategory,
                       String businessNo, String businessCategory,
                       String memberRelation) {}

    /** 미분류 작업함의 가맹점 묶음 (§55.8). */
    record UnclassifiedGroup(String merchantName, int count, long grossTotal,
                             String firstApprovedAt, String lastApprovedAt,
                             String businessCategory, String businessNo) {}

    /**
     * 월별 대분류 지출 합계 — 대시보드 추이 차트용.
     * 자산 이동(저축/투자)은 지출이 아니므로 제외한다(§55.10.3).
     * 미분류는 category = "미분류" 로 묶는다.
     */
    record MonthlyCategoryTotal(String month, String category, long gross) {}

    List<ImportedRow> all();

    /** 승인일이 해당 월(YYYY-MM)인 행 — 지출 화면의 "가져온 카드내역" 표용 (§42). */
    List<ImportedRow> inMonth(String month);

    Set<String> existingRowKeys();

    /** 이미 있는 rowKey 는 건너뛴다(§29.6 중복 반영 금지). 새로 저장된 건수를 돌려준다. */
    int addAll(List<ImportedRow> incoming);

    /** rowKey 로 한 행을 찾는다 — 카테고리 수정 API 용 (§55.8). */
    Optional<ImportedRow> find(String rowKey);

    /** 기존 행의 대분류·세부를 변경한다 (§55.8 일괄 재분류). 변경된 행이 있으면 true. */
    boolean updateClassification(String rowKey, String category, String subCategory);

    /** 같은 가맹점의 모든 행을 한 분류로 바꾼다 (§55.8 사용자 수정). 변경 건수를 돌려준다. */
    int updateClassificationByMerchant(String merchantName, String category, String subCategory);

    /** 미분류 행을 가맹점 단위로 묶어 금액 큰 순으로 돌려준다 (§55.8 작업함). */
    List<UnclassifiedGroup> unclassifiedGroups();

    /** 같은 가맹점의 모든 행을 미분류로 되돌린다 (§55.8 되돌리기). 변경 건수를 돌려준다. */
    int clearClassificationByMerchant(String merchantName);

    /**
     * fromMonth~toMonth(YYYY-MM, 양끝 포함)의 월별 대분류 지출 합계.
     * 자산 이동(저축/투자) 행은 뺀다 — 지출 추이 차트가 소비만 보여주도록.
     */
    List<MonthlyCategoryTotal> monthlyCategoryTotals(String fromMonth, String toMonth);
}
