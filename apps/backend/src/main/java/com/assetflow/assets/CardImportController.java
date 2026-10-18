package com.assetflow.assets;

import com.assetflow.assets.CardImportLedger.ImportedRow;
import com.assetflow.common.api.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 카드매입 임포트 확정 API (§41).
 * §29.2 신뢰 경계: 조작된/오류난 미리보기가 그대로 저장되지 않게 서버가 재검증한다.
 * §29.7: 합계는 요청에서 받지 않고 저장된 행에서 재계산해 돌려준다.
 */
@RestController
@RequestMapping("/api/v1/assets")
public class CardImportController {

    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    private final CardImportLedger ledger;

    public CardImportController(CardImportLedger ledger) {
        this.ledger = ledger;
    }

    public record ImportRow(String rowKey, String approvedAt, String merchantName,
                            Long supplyExVat, Long vat, Long grossAmount,
                            String cardMasked, String expenseKind) {}

    public record ImportRequest(List<ImportRow> rows, Map<String, String> merchantRules) {}

    @GetMapping("/card-imports/row-keys")
    public ApiResponse<List<String>> rowKeys() {
        return new ApiResponse<>("OK", "Row keys loaded", List.copyOf(ledger.existingRowKeys()));
    }

    @PostMapping("/card-imports")
    public ApiResponse<Map<String, Object>> submit(@RequestBody ImportRequest request) {
        if (request.rows() == null || request.rows().isEmpty()) {
            throw new IllegalArgumentException("rows is empty");
        }
        List<ImportedRow> incoming = new ArrayList<>();
        int supplyInconsistent = 0;
        for (ImportRow row : request.rows()) {
            ImportedRow r = new ImportedRow(
                    requiredText(row.rowKey(), "rowKey"),
                    requiredIsoDate(row.approvedAt()),
                    requiredText(row.merchantName(), "merchantName"),
                    requiredLong(row.supplyExVat(), "supplyExVat"),
                    requiredLong(row.vat(), "vat"),
                    requiredLong(row.grossAmount(), "grossAmount"),
                    row.cardMasked() == null ? "" : row.cardMasked(),
                    row.expenseKind() == null ? "" : row.expenseKind());
            // §29.3 공급가액+세액=공급대가 를 행마다 검사한다 — 어긋나면 저장은 하되
            // 경고를 돌려준다(현대카드의 가맹점 신고 부가세 변형이 정상 범위라 잘라내지 않는다).
            if (r.supplyExVat() + r.vat() != r.grossAmount()) {
                supplyInconsistent++;
            }
            incoming.add(r);
        }

        // §29.6: 중복 rowKey 는 한 건만 반영 — 건수를 결과로 알린다
        int stored = ledger.addAll(incoming);
        List<ImportedRow> all = ledger.all();

        // 합계는 행에서 재계산 (§29.7 — 스냅샷에 합계를 두지 않는다)
        long gross = 0, vat = 0, supply = 0;
        for (ImportedRow r : all) {
            gross += r.grossAmount();
            vat += r.vat();
            supply += r.supplyExVat();
        }
        Set<String> keys = ledger.existingRowKeys();
        int duplicatesInBatch = incoming.size() - new HashSet<String>(incoming.stream().map(ImportedRow::rowKey).toList()).size();
        return new ApiResponse<>("OK", "Card imports stored", Map.of(
                "stored", stored,
                "received", incoming.size(),
                "totalRows", all.size(),
                "duplicatesInBatch", duplicatesInBatch,
                "knownRowKeys", keys.size(),
                "totals", Map.of("gross", gross, "vat", vat, "supplyExVat", supply),
                "supplyInconsistentRows", supplyInconsistent));
    }

    private String requiredText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }

    private String requiredIsoDate(String value) {
        if (value == null || !ISO_DATE.matcher(value).matches()) {
            throw new IllegalArgumentException("approvedAt must be an ISO date (YYYY-MM-DD)");
        }
        return value;
    }

    /** 정수 검증. 음수는 허용 — 취소 행이 음수 금액으로 온다(§29.5.2 삼성). */
    private long requiredLong(Long value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }
}
