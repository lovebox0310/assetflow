package com.assetflow.assets.card;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * §29.3 카드 명세 컬럼 계약(card-columns.json)을 classpath 에서 읽는다.
 * FE 의 `apps/frontend/src/lib/card` 파서와 같은 JSON 을 본다 —
 * 복사본이 아니라 build.gradle 의 `processResources` 가 샘플 평더에서 복사한 파일이다.
 */
public final class CardContract {
    private static final String CONTRACT_PATH = "/card/card-columns.json";

    private final JsonNode contract;

    private CardContract(JsonNode contract) {
        this.contract = contract;
    }

    public static CardContract loadDefault() {
        try (InputStream in = CardContract.class.getResourceAsStream(CONTRACT_PATH)) {
            if (in == null) {
                throw new IllegalStateException("card-columns.json not found on classpath at " + CONTRACT_PATH);
            }
            return new CardContract(new ObjectMapper().readTree(in));
        } catch (IOException e) {
            throw new IllegalStateException("failed to load card contract", e);
        }
    }

    public record FieldDef(String name, boolean required, String source, List<String> aliases, JsonNode def) {
    }

    public record CompanyDetect(List<String> headerSignature, int minScore) {
    }

    public record CompanyProfile(String name, String title, CompanyDetect detect,
                                  String memberRelationDefault, String cardCompanyLabel,
                                  boolean maskCardNumber, boolean dateDotFormat,
                                  boolean statusReversal, boolean negativeIsReversal,
                                  boolean totalsAfterHeader) {
    }

    public List<FieldDef> fields() {
        return defs(contract.path("fields"));
    }

    public List<FieldDef> optionalFields() {
        return defs(contract.path("optionalFields"));
    }

    private List<FieldDef> defs(JsonNode node) {
        List<FieldDef> out = new ArrayList<>();
        if (node.isMissingNode() || !node.isObject()) return out;
        Iterator<Map.Entry<String, JsonNode>> it = node.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            JsonNode d = e.getValue();
            boolean required = d.path("required").asBoolean(false);
            String source = d.path("source").asText("column");
            List<String> aliases = new ArrayList<>();
            JsonNode aliasesNode = d.path("headerAliases");
            if (aliasesNode.isArray()) {
                for (JsonNode a : aliasesNode) aliases.add(a.asText());
            }
            out.add(new FieldDef(e.getKey(), required, source, aliases, d));
        }
        return out;
    }

    /**
     * headerAliases → fieldName 맵. 정규화: 공백·괄호 제거 + 소문자.
     */
    public Map<String, String> aliasMap() {
        Map<String, String> map = new HashMap<>();
        for (FieldDef f : fields()) addAliases(map, f);
        for (FieldDef f : optionalFields()) addAliases(map, f);
        return map;
    }

    private void addAliases(Map<String, String> map, FieldDef f) {
        for (String a : f.aliases()) {
            String k = normHeader(a);
            map.putIfAbsent(k, f.name());
        }
    }

    public List<FieldDef> requiredColumnFields() {
        List<FieldDef> out = new ArrayList<>();
        for (FieldDef f : fields()) {
            if (f.required() && "column".equals(f.source())) out.add(f);
        }
        return out;
    }

    public CompanyProfile companyProfile(String company) {
        JsonNode companies = contract.path("companies");
        JsonNode node = companies.path(company);
        if (node.isMissingNode()) return null;

        JsonNode detect = node.path("detect");
        List<String> sig = new ArrayList<>();
        JsonNode sigNode = detect.path("headerSignature");
        if (sigNode.isArray()) for (JsonNode s : sigNode) sig.add(s.asText());
        int minScore = detect.path("minScore").asInt(3);

        // 회사별 동작은 계약 프로파일에서 가능한 한 읽되, 아직 계약에 없는 항목은
        // 이전 결정(§29.5.2, §29.5.3)에 따라 기본값을 둔다.
        String title = node.path("title").asText(company);
        String memberRelationDefault = "hyundaicard".equals(company) ? null : "본인";
        String cardCompanyLabel = "hyundaicard".equals(company) ? "현대카드" : "삼성카드";
        boolean maskCardNumber = "hyundaicard".equals(company);
        boolean dateDotFormat = "hyundaicard".equals(company);
        boolean statusReversal = "hyundaicard".equals(company);
        boolean negativeIsReversal = "samsungcard".equals(company);
        boolean totalsAfterHeader = "hyundaicard".equals(company);

        return new CompanyProfile(
                company, title, new CompanyDetect(sig, minScore),
                memberRelationDefault, cardCompanyLabel, maskCardNumber, dateDotFormat,
                statusReversal, negativeIsReversal, totalsAfterHeader
        );
    }

    public String detectCompany(Collection<String> cells) {
        JsonNode companies = contract.path("companies");
        if (companies.isMissingNode() || !companies.isObject()) return null;
        Iterator<Map.Entry<String, JsonNode>> it = companies.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            JsonNode profile = e.getValue();
            if (!profile.isObject()) continue;
            JsonNode detect = profile.path("detect");
            if (detect.isMissingNode()) continue;
            JsonNode sigNode = detect.path("headerSignature");
            int minScore = detect.path("minScore").asInt(3);
            if (!sigNode.isArray()) continue;
            int score = 0;
            for (JsonNode s : sigNode) {
                if (cells.contains(normHeader(s.asText()))) score++;
            }
            if (score >= minScore) return e.getKey();
        }
        return null;
    }

    public static String normHeader(String s) {
        return s.replaceAll("\\s+", "").replaceAll("[()]", "").toLowerCase(Locale.ROOT);
    }
}
