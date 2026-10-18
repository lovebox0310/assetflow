package com.assetflow.assets;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 자산 원장(리포지토리 자리). 스프린트 1의 MockDashboardSource 를 일반화한 것 —
 * §39 DB 전략: DB 연결 시 이 클래스만 영속 구현으로 교체하면 API 계약(§40)은 그대로.
 * §31.1: 합계·구성비는 여기서 만들지 않는다 — 행만 보관한다.
 */
@Component
public class AssetLedger {

    public record AssetRow(long id, String accountType, String name, String institutionName,
                           long balance, boolean isDebt, String openedAt) {}

    private final List<AssetRow> rows = new ArrayList<>(seed());
    private final AtomicLong nextId = new AtomicLong(100);

    /** §36.2 mock 기준선 — 대시보드 카드 기준값과 동일한 시드. */
    private static List<AssetRow> seed() {
        List<AssetRow> seed = new ArrayList<>();
        long id = 1;
        seed.add(new AssetRow(id++, "cash", "우리 파킹통장", "우리은행", 18_500_000L, false, null));
        seed.add(new AssetRow(id++, "cash", "씨티 요구불", "씨티은행", 6_200_000L, false, null));
        seed.add(new AssetRow(id++, "deposit", "우리 예적금", "우리은행", 42_000_000L, false, null));
        seed.add(new AssetRow(id++, "invest", "키움 투자금", "키움증권", 31_000_000L, false, null));
        seed.add(new AssetRow(id++, "invest", "미국주식", "", 23_500_000L, false, null));
        seed.add(new AssetRow(id++, "realty", "실거주 아파트", "", 640_000_000L, false, null));
        seed.add(new AssetRow(id, "realty", "주택담보대출", "", 69_355_560L, true, null));
        return seed;
    }

    public List<AssetRow> all() {
        synchronized (rows) {
            return List.copyOf(rows);
        }
    }

    public AssetRow create(String accountType, String name, String institutionName,
                           long balance, boolean isDebt, String openedAt) {
        AssetRow row = new AssetRow(nextId.getAndIncrement(), accountType, name,
                institutionName == null ? "" : institutionName, balance, isDebt, openedAt);
        synchronized (rows) {
            rows.add(row);
        }
        return row;
    }

    public AssetRow update(long id, String accountType, String name, String institutionName,
                           long balance, boolean isDebt, String openedAt) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).id() == id) {
                    AssetRow row = new AssetRow(id, accountType, name,
                            institutionName == null ? "" : institutionName, balance, isDebt, openedAt);
                    rows.set(i, row);
                    return row;
                }
            }
        }
        throw new com.assetflow.common.api.NotFoundException("account id " + id);
    }

    public void delete(long id) {
        synchronized (rows) {
            boolean removed = rows.removeIf(r -> r.id() == id);
            if (!removed) {
                throw new com.assetflow.common.api.NotFoundException("account id " + id);
            }
        }
    }
}
