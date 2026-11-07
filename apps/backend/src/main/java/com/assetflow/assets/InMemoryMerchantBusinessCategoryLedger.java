package com.assetflow.assets;

import com.assetflow.expenses.categories.BusinessCategorySeed;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/** 인메모리 사용자 사업자번호 규칙 원장 (§67, §73). 테스트·CI 기본값. */
@Component
@Profile("!postgres")
public class InMemoryMerchantBusinessCategoryLedger implements MerchantBusinessCategoryLedger {

    private final List<Mapping> mappings = new ArrayList<>();
    private final AtomicLong nextId = new AtomicLong(1);

    @Override
    public List<Mapping> mappingsFor(String businessNo) {
        if (businessNo == null || businessNo.isBlank()) {
            return List.of();
        }
        synchronized (mappings) {
            return mappings.stream().filter(m -> businessNo.equals(m.businessNo())).toList();
        }
    }

    @Override
    public boolean hasPatternMapping(String businessNo) {
        if (businessNo == null || businessNo.isBlank()) {
            return false;
        }
        for (BusinessCategorySeed.Entry entry : BusinessCategorySeed.entries()) {
            if (businessNo.equals(entry.businessNo()) && !entry.pattern().isEmpty()) {
                return true;
            }
        }
        synchronized (mappings) {
            return mappings.stream()
                    .anyMatch(m -> businessNo.equals(m.businessNo()) && !m.merchantPattern().isEmpty());
        }
    }

    @Override
    public void upsertUser(String businessNo, String merchantPattern, String category, String subCategory) {
        String pattern = merchantPattern == null ? "" : merchantPattern;
        synchronized (mappings) {
            for (int i = 0; i < mappings.size(); i++) {
                Mapping current = mappings.get(i);
                if (current.businessNo().equals(businessNo)
                        && current.merchantPattern().equals(pattern)) {
                    mappings.set(i, new Mapping(current.id(), businessNo, pattern, category,
                            subCategory == null ? "" : subCategory, "user"));
                    return;
                }
            }
            mappings.add(new Mapping(nextId.getAndIncrement(), businessNo, pattern, category,
                    subCategory == null ? "" : subCategory, "user"));
        }
    }

    @Override
    public void deleteUserMapping(String businessNo, String merchantPattern) {
        if (businessNo == null || businessNo.isBlank()) {
            return;
        }
        String pattern = merchantPattern == null ? "" : merchantPattern;
        synchronized (mappings) {
            mappings.removeIf(m -> "user".equals(m.source())
                    && businessNo.equals(m.businessNo())
                    && pattern.equals(m.merchantPattern()));
        }
    }
}
