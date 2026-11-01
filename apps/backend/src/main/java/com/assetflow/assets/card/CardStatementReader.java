package com.assetflow.assets.card;

import com.assetflow.assets.card.CardContract.CompanyProfile;
import com.assetflow.assets.card.CardContract.FieldDef;
import org.apache.poi.EncryptedDocumentException;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * §29.2 BE 재검증용 카드 명세서 판독기.
 *
 * - 평문 CSV 와 평문 XLSX(POI) 를 읽는다.
 * - 암호화(CFB) 파일은 EncryptedDocumentException/NotOLE2DocumentException 으로
 *   실패하며 호출자가 "암호화 파일은 열지 않는다"고 안내한다(§29.5.1).
 * - 카드사 판별·헤더 매핑·값 정규화는 모두 card-columns.json 계약에 따른다.
 * - 삼성/현대 파서의 핵심 규칙(음수 취소, 카드번호 마스킹, 관계 정규화 등)을
n *   Java 로 포팅했고, 동일한 익명화 샘플에 대해 FE 파서와 행 수·합계를 맞춘다.
 */
public class CardStatementReader {

    private static final Pattern MONTH_DAY = Pattern.compile("^(\\d{4})[-.](\\d{2})[-.](\\d{2})$");
    private static final Pattern COUNT_IN_CELL = Pattern.compile("(\\d+)\\s*건");
    private static final Pattern COUNT_ANYWHERE = Pattern.compile("(\\d+)\\s*건");
    private static final Pattern TOTAL_LABEL = Pattern.compile("총\\s*합계|합\\s*계|총\\s*건수|건\\s*수|소\\s*계|전체합계");

    private final CardContract contract;

    public CardStatementReader(CardContract contract) {
        this.contract = contract;
    }

    public record ParsedRow(String rowKey, String approvedAt, String merchantName,
                            long grossAmount, long vat, long supplyExVat,
                            String cardMasked, String businessNo, String businessCategory,
                            String memberRelation, String cardCompany, String reversal,
                            Long approvedAmount, Long installmentCount, int sourceRow) {
    }

    public record Warning(int row, String code, String message) {
    }

    public record DeclaredTotals(long gross, long vat, Long count, Long approved, int valueRow) {
    }

    public record CrossCheck(long rowSumGross, long declaredGross, long grossDelta,
                             long rowSumVat, long declaredVat, long vatDelta,
                             int rowCount, Long declaredCount, boolean grossOk, boolean vatOk,
                             Boolean countOk) {
    }

    public record Result(String company, String cardCompanyLabel, List<ParsedRow> rows,
                         DeclaredTotals declaredTotals, CrossCheck crossCheck,
                         List<Warning> warnings) {
    }

    public Result read(byte[] bytes) throws IOException {
        String container = inspectContainer(bytes);
        return switch (container) {
            case "zip" -> readXlsx(bytes);
            case "csv" -> readCsv(bytes);
            case "cfb" -> throw new IllegalArgumentException(
                    "암호화된 카드사 파일(OLE2)은 열 수 없습니다.");
            default -> throw new IllegalArgumentException(
                    "지원하지 않는 파일 형식입니다. 삼성카드/현대카드 CSV·XLSX 만 지원합니다.");
        };
    }

    private String inspectContainer(byte[] bytes) {
        if (bytes.length >= 2 && bytes[0] == 0x50 && bytes[1] == 0x4b) return "zip";
        if (bytes.length >= 4 && bytes[0] == (byte) 0xd0 && bytes[1] == (byte) 0xcf
                && bytes[2] == (byte) 0x11 && bytes[3] == (byte) 0xe0) return "cfb";
        if (bytes.length >= 3 && bytes[0] == (byte) 0xef && bytes[1] == (byte) 0xbb && bytes[2] == (byte) 0xbf)
            return "csv";
        if (bytes.length > 0 && bytes[0] >= 0x20 && bytes[0] < 0x7f) return "csv";
        return "unknown";
    }

    private Result readCsv(byte[] bytes) {
        String text = stripBomAndDecode(bytes);
        List<List<String>> rows = parseCsv(text);
        String company = detectCompany(rows);
        return parseRows(rows, company);
    }

    private Result readXlsx(byte[] bytes) throws IOException {
        try (InputStream in = new ByteArrayInputStream(bytes);
             Workbook wb = WorkbookFactory.create(in)) {
            DataFormatter fmt = new DataFormatter(Locale.ROOT);
            List<List<List<String>>> candidates = new ArrayList<>();
            for (Sheet sheet : wb) {
                List<List<String>> rows = new ArrayList<>();
                for (Row r : sheet) {
                    if (r == null) continue;
                    List<String> cells = new ArrayList<>();
                    short last = r.getLastCellNum();
                    for (int i = 0; i <= last; i++) {
                        cells.add(formatCell(r.getCell(i), fmt));
                    }
                    rows.add(cells);
                }
                candidates.add(rows);
            }
            for (List<List<String>> rows : candidates) {
                String company = detectCompany(rows);
                if (company != null) return parseRows(rows, company);
            }
            throw new IllegalArgumentException("XLSX 에서 카드사 명세 표를 찾지 못했습니다.");
        } catch (EncryptedDocumentException e) {
            throw new IllegalArgumentException("암호화된 카드사 파일은 열 수 없습니다.", e);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("XLSX 파일을 읽지 못했습니다. 파일이 손상됐거나 암호화되어 있는지 확인해 주세요.", e);
        }
    }

    private String formatCell(Cell cell, DataFormatter fmt) {
        if (cell == null) return "";
        if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            return fmt.formatCellValue(cell);
        }
        return fmt.formatCellValue(cell);
    }

    private String stripBomAndDecode(byte[] bytes) {
        byte[] data = bytes;
        if (bytes.length >= 3 && bytes[0] == (byte) 0xef && bytes[1] == (byte) 0xbb && bytes[2] == (byte) 0xbf) {
            data = new byte[bytes.length - 3];
            System.arraycopy(bytes, 3, data, 0, data.length);
        }
        return new String(data, StandardCharsets.UTF_8);
    }

    /**
     * RFC4180 파서 — FE 의 card-common.mjs 와 같은 동작.
     */
    static List<List<String>> parseCsv(String text) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuote = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inQuote) {
                if (c == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        inQuote = false;
                    }
                } else {
                    field.append(c);
                }
            } else if (c == '"') {
                inQuote = true;
            } else if (c == ',') {
                row.add(field.toString());
                field.setLength(0);
            } else if (c == '\n') {
                row.add(field.toString());
                rows.add(new ArrayList<>(row));
                row.clear();
                field.setLength(0);
            } else if (c != '\r') {
                field.append(c);
            }
        }
        if (field.length() > 0 || !row.isEmpty()) {
            row.add(field.toString());
            rows.add(row);
        }
        return rows;
    }

    private String detectCompany(List<List<String>> rows) {
        Set<String> cells = new HashSet<>();
        for (int i = 0; i < Math.min(rows.size(), 60); i++) {
            for (String c : rows.get(i)) cells.add(CardContract.normHeader(c));
        }
        return contract.detectCompany(cells);
    }

    private Result parseRows(List<List<String>> rows, String company) {
        if (company == null) {
            throw new IllegalArgumentException("카드사를 판별할 수 없습니다.");
        }
        CompanyProfile profile = contract.companyProfile(company);
        if (profile == null) {
            throw new IllegalArgumentException("지원하지 않는 카드사입니다: " + company);
        }

        Header header = findHeaderRow(rows);
        Map<String, Integer> col = header.col;

        List<ParsedRow> out = new ArrayList<>();
        List<Warning> warnings = new ArrayList<>();
        Map<String, Integer> occurrence = new LinkedHashMap<>();

        for (int i = header.rowIndex + 1; i < rows.size(); i++) {
            List<String> r = rows.get(i);
            if (isEmptyRow(r)) continue;

            Long gross = parseAmount(at(r, col, "grossAmount"));
            String merchant = at(r, col, "merchantName");
            if (gross == null || merchant.isEmpty()) continue;

            String rawDate = at(r, col, "approvedAt");
            String isoDate = normalizeDate(rawDate, profile.dateDotFormat());

            // 현대: 날짜 없으면 합계행/데이터 손실 구분
            if (profile.dateDotFormat() && isoDate == null) {
                if (COUNT_IN_CELL.matcher(merchant).matches()) continue; // 합계/건수 행
                warnings.add(new Warning(i + 1, "rowSkippedNoDate",
                        "가맹점 '" + merchant + "', 금액 " + gross + " 인 행의 날짜를 읽지 못했다."));
                continue;
            }

            Long vatRaw = parseAmount(at(r, col, "vat"));
            long vat = vatRaw == null ? 0 : vatRaw;

            String reversal;
            if (profile.statusReversal()) {
                String status = at(r, col, "reversal");
                reversal = "취소".equals(status) ? "매입취소" : "매입";
            } else if (profile.negativeIsReversal()) {
                reversal = gross < 0 ? "매입취소" : "매입";
            } else {
                reversal = gross < 0 ? "매입취소" : "매입";
            }

            Long supplyCol = parseAmount(at(r, col, "supplyExVat"));
            long supplyExVat = supplyCol != null ? supplyCol : gross - vat;
            if (supplyCol != null && supplyCol + vat != gross) {
                warnings.add(new Warning(i + 1, "supplyInconsistent",
                        "공급가액 " + supplyCol + " + 세액 " + vat + " = " + (supplyCol + vat)
                                + " 인데 이용금액은 " + gross + " 다."));
            }

            String memberRelation;
            if (profile.memberRelationDefault() != null) {
                memberRelation = profile.memberRelationDefault();
            } else {
                memberRelation = normalizeMemberRelation(at(r, col, "memberRelation"));
            }

            String cardMasked = at(r, col, "cardMasked");
            if (profile.maskCardNumber()) {
                cardMasked = maskCardNumber(cardMasked);
            }

            String businessNo = at(r, col, "businessNo").replaceAll("-", "");
            String businessCategory = opt(at(r, col, "businessCategory"));
            Long approvedAmount = parseAmount(at(r, col, "approvedAmount"));
            Long installmentCount = parseAmount(at(r, col, "installmentCount"));
            String approvalNo = opt(at(r, col, "approvalNo"));

            // 삼성 전용 검사
            if ("samsungcard".equals(company)) {
                if (vat != 0) {
                    double expected = supplyExVat * 0.1;
                    if (Math.abs(expected - vat) >= 1) {
                        warnings.add(new Warning(i + 1, "vatMismatch",
                                "공급가액 " + supplyExVat + " 의 10% 는 " + expected
                                        + " 인데 세액은 " + vat + " 이다."));
                    }
                }
                if (vat != 0 && Long.signum(vat) != Long.signum(gross)) {
                    warnings.add(new Warning(i + 1, "signMismatch", "이용금액과 세액의 부호가 반대다."));
                }
            }

            // 현대 전용 검사
            if ("hyundaicard".equals(company)) {
                if (supplyExVat < 0 && !"매입취소".equals(reversal)) {
                    warnings.add(new Warning(i + 1, "vatExceedsGross",
                            "이용금액 " + gross + " 보다 부가세 " + vat + " 가 크다."));
                }
                if (("매입취소".equals(reversal)) != (gross < 0)) {
                    warnings.add(new Warning(i + 1, "reversalSignMismatch",
                            "상태와 이용금액 부호가 일치하지 않는다."));
                }
            }

            ParsedRow row = new ParsedRow(
                    buildRowKey(company, isoDate, merchant, gross, vat, approvalNo, cardMasked,
                            reversal, installmentCount, occurrence),
                    isoDate == null ? rawDate : isoDate,
                    merchant, gross, vat, supplyExVat,
                    cardMasked.isEmpty() ? null : cardMasked,
                    businessNo.isEmpty() ? null : businessNo,
                    businessCategory,
                    memberRelation,
                    profile.cardCompanyLabel(),
                    reversal,
                    approvedAmount,
                    installmentCount,
                    i + 1
            );
            out.add(row);
        }

        DeclaredTotals declaredTotals = profile.totalsAfterHeader()
                ? extractDeclaredTotalsAfter(rows.subList(header.rowIndex + 1, rows.size()), col)
                : extractDeclaredTotalsBefore(rows.subList(0, header.rowIndex));
        CrossCheck crossCheck = computeCrossCheck(out, declaredTotals);

        return new Result(company, profile.cardCompanyLabel(), out, declaredTotals, crossCheck, warnings);
    }

    private Header findHeaderRow(List<List<String>> rows) {
        Map<String, String> aliasMap = contract.aliasMap();
        List<FieldDef> required = contract.requiredColumnFields();

        Header best = null;
        int bestScore = 0;
        Header nearest = null;
        int nearestMatched = -1;

        for (int i = 0; i < rows.size(); i++) {
            List<String> cells = rows.get(i);
            Mapped mapped = mapColumns(cells, aliasMap);
            if (hasMissing(mapped.col, required)) {
                int matched = mapped.matched;
                if (matched > nearestMatched) {
                    nearest = new Header(i, mapped.col, matched);
                    nearestMatched = matched;
                }
                continue;
            }
            int score = mapped.matched;
            if (score > bestScore) {
                bestScore = score;
                best = new Header(i, mapped.col, score);
            }
        }

        if (best == null) {
            String detail = nearest != null && nearest.matched > 0
                    ? " 가장 닮은 행은 " + (nearest.rowIndex + 1) + "행("
                    + nearest.matched + "개 매칭)인데 필수 컬럼이 부족하다."
                    : " 매핑에 걸리는 컬럼이 하나도 없다.";
            throw new IllegalArgumentException("컬럼 헤더를 찾지 못했다." + detail);
        }
        return best;
    }

    private Mapped mapColumns(List<String> cells, Map<String, String> aliasMap) {
        Map<String, Integer> col = new HashMap<>();
        int matched = 0;
        for (int i = 0; i < cells.size(); i++) {
            String h = CardContract.normHeader(cells.get(i));
            String f = aliasMap.get(h);
            if (f != null && !col.containsKey(f)) {
                col.put(f, i);
                matched++;
            }
        }
        return new Mapped(col, matched);
    }

    private boolean hasMissing(Map<String, Integer> col, List<FieldDef> required) {
        for (FieldDef f : required) {
            if (!col.containsKey(f.name())) return true;
        }
        return false;
    }

    private String at(List<String> row, Map<String, Integer> col, String field) {
        Integer idx = col.get(field);
        if (idx == null || idx >= row.size()) return "";
        String v = row.get(idx);
        return v == null ? "" : v.trim();
    }

    private String opt(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private boolean isEmptyRow(List<String> row) {
        for (String c : row) {
            if (c != null && !c.trim().isEmpty()) return false;
        }
        return true;
    }

    private Long parseAmount(String s) {
        if (s == null) return null;
        String t = s.replaceAll("[,\\s원]", "").replaceAll("[()]", "");
        if (t.isEmpty() || "-".equals(t)) return null;
        if (!t.matches("-?\\d+(\\.\\d+)?")) return null;
        // 정수 부분만 필요하다(할부 횟수 등).
        double d = Double.parseDouble(t);
        return (long) d;
    }

    private String normalizeDate(String raw, boolean dotFormat) {
        String v = raw == null ? "" : raw.trim();
        Matcher m = MONTH_DAY.matcher(v);
        if (!m.matches()) return null;
        int month = Integer.parseInt(m.group(2));
        int day = Integer.parseInt(m.group(3));
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return m.group(1) + "-" + m.group(2) + "-" + m.group(3);
    }

    private String normalizeMemberRelation(String raw) {
        String v = raw == null ? "" : raw.trim();
        if (v.isEmpty()) return "본인";
        String first = v.split("\\s+")[0];
        if ("본인".equals(first) || "가족".equals(first)) return first;
        return v;
    }

    private String maskCardNumber(String raw) {
        String v = raw == null ? "" : raw.trim();
        if (v.isEmpty()) return "";
        if (v.contains("*")) return v;
        if (v.matches("\\d{4}-\\d{4}-\\d{4}-\\d{4}")) {
            return v.substring(0, 4) + "-****-****-" + v.substring(15);
        }
        if (v.matches("\\d{15,19}")) {
            return v.substring(0, 4) + "-****-****-" + v.substring(v.length() - 4);
        }
        return v.length() >= 4 ? "****" + v.substring(v.length() - 4) : "****";
    }

    private String buildRowKey(String company, String isoDate, String merchant, long gross, long vat,
                                String approvalNo, String cardMasked, String reversal,
                                Long installmentCount, Map<String, Integer> occurrence) {
        String base;
        if ("samsungcard".equals(company)) {
            base = String.join("|", isoDate == null ? "" : isoDate, merchant,
                    String.valueOf(gross), String.valueOf(vat),
                    approvalNo == null ? "" : approvalNo,
                    cardMasked == null ? "" : cardMasked);
        } else {
            base = String.join("|", isoDate == null ? "" : isoDate, merchant,
                    String.valueOf(gross), String.valueOf(vat),
                    cardMasked == null ? "" : cardMasked,
                    reversal,
                    installmentCount == null ? "" : String.valueOf(installmentCount));
        }
        int n = occurrence.getOrDefault(base, 0) + 1;
        occurrence.put(base, n);
        return base + "#" + n;
    }

    private DeclaredTotals extractDeclaredTotalsBefore(List<List<String>> rows) {
        for (int i = 0; i < rows.size(); i++) {
            if (TOTAL_LABEL.matcher(flatRow(rows.get(i))).find()) {
                for (int j = i + 1; j < Math.min(i + 2, rows.size()); j++) {
                    List<Long> nums = parseAmounts(rows.get(j));
                    if (nums.size() >= 2) {
                        return new DeclaredTotals(nums.get(0), nums.get(1), null, null, j + 1);
                    }
                }
            }
        }
        return null;
    }

    private DeclaredTotals extractDeclaredTotalsAfter(List<List<String>> rows, Map<String, Integer> col) {
        for (int i = 0; i < rows.size(); i++) {
            List<String> r = rows.get(i);
            if (TOTAL_LABEL.matcher(flatRow(r)).find()) {
                String dateCell = at(r, col, "approvedAt");
                if (normalizeDate(dateCell, true) != null) continue; // 데이터 행
                Long gross = parseAmount(at(r, col, "grossAmount"));
                Long vat = parseAmount(at(r, col, "vat"));
                if (gross == null || vat == null) continue;
                String countCell = at(r, col, "merchantName");
                Matcher m = countCell != null ? COUNT_IN_CELL.matcher(countCell) : null;
                if (m == null || !m.find()) {
                    m = COUNT_ANYWHERE.matcher(r.stream().reduce((a, b) -> a + " " + b).orElse(""));
                }
                Long count = m.find() ? Long.valueOf(m.group(1)) : null;
                Long approved = parseAmount(at(r, col, "approvedAmount"));
                return new DeclaredTotals(gross, vat, count, approved, i + 1);
            }
        }
        return null;
    }

    private String flatRow(List<String> row) {
        StringBuilder sb = new StringBuilder();
        for (String c : row) sb.append(c == null ? "" : c.trim());
        return sb.toString();
    }

    private List<Long> parseAmounts(List<String> row) {
        List<Long> out = new ArrayList<>();
        for (String c : row) {
            Long v = parseAmount(c);
            if (v != null) out.add(v);
        }
        return out;
    }

    private CrossCheck computeCrossCheck(List<ParsedRow> rows, DeclaredTotals declared) {
        long rowGross = 0, rowVat = 0;
        for (ParsedRow r : rows) {
            rowGross += r.grossAmount();
            rowVat += r.vat();
        }
        if (declared == null) return null;
        boolean grossOk = rowGross == declared.gross();
        boolean vatOk = rowVat == declared.vat();
        Boolean countOk = declared.count() == null ? null : rows.size() == declared.count();
        return new CrossCheck(rowGross, declared.gross(), rowGross - declared.gross(),
                rowVat, declared.vat(), rowVat - declared.vat(),
                rows.size(), declared.count(), grossOk, vatOk, countOk);
    }

    private record Header(int rowIndex, Map<String, Integer> col, int matched) {
    }

    private record Mapped(Map<String, Integer> col, int matched) {
    }
}
