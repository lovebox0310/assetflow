package com.assetflow.assets;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@Component
@Profile("!postgres")
public class InMemoryMerchantRuleLedger implements MerchantRuleLedger {

    private final Map<String, MerchantRule> rules = new HashMap<>();

    @Override
    public Map<String, String> allRules() {
        synchronized (rules) {
            Map<String, String> out = new HashMap<>();
            rules.forEach((merchant, rule) -> out.put(merchant, rule.category()));
            return Map.copyOf(out);
        }
    }

    @Override
    public Map<String, String> rulesFor(Set<String> merchantNames) {
        Set<String> wanted = new HashSet<>(merchantNames);
        synchronized (rules) {
            Map<String, String> out = new HashMap<>();
            for (Map.Entry<String, MerchantRule> e : rules.entrySet()) {
                if (wanted.contains(e.getKey())) {
                    out.put(e.getKey(), e.getValue().category());
                }
            }
            return Map.copyOf(out);
        }
    }

    @Override
    public Map<String, MerchantRule> allRuleDetails() {
        synchronized (rules) {
            return Map.copyOf(rules);
        }
    }

    @Override
    public Map<String, MerchantRule> ruleDetailsFor(Set<String> merchantNames) {
        Set<String> wanted = new HashSet<>(merchantNames);
        synchronized (rules) {
            Map<String, MerchantRule> out = new HashMap<>();
            for (Map.Entry<String, MerchantRule> e : rules.entrySet()) {
                if (wanted.contains(e.getKey())) {
                    out.put(e.getKey(), e.getValue());
                }
            }
            return Map.copyOf(out);
        }
    }

    @Override
    public void saveAll(Map<String, String> incoming) {
        if (incoming == null || incoming.isEmpty()) {
            return;
        }
        Map<String, MerchantRule> details = new HashMap<>();
        incoming.forEach((merchant, category) -> details.put(merchant, new MerchantRule(category, "")));
        saveAllDetails(details);
    }

    @Override
    public void saveAllDetails(Map<String, MerchantRule> incoming) {
        if (incoming == null || incoming.isEmpty()) {
            return;
        }
        synchronized (rules) {
            rules.putAll(incoming);
        }
    }

    @Override
    public void delete(String merchantName) {
        synchronized (rules) {
            rules.remove(merchantName);
        }
    }
}
