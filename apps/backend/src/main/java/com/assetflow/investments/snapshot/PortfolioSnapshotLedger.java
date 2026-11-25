package com.assetflow.investments.snapshot;

import java.time.LocalDate;
import java.util.List;

/**
 * 투자 추이 스냅샷 원장 (이슈 #52).
 *
 * <p>총액만 저장한다 — 원금·평가·예수금. 종목별 이력은 이번 범위가 아니다(사용자 결정).
 * 같은 날 여러 점(09:05·15:35·수동)을 허용하므로 날짜 유니크 제약을 두지 않는다.</p>
 */
public interface PortfolioSnapshotLedger {

    record Snapshot(LocalDate takenOn, long totalCost, long totalValue, long cash, String source) {}

    void save(long userId, Snapshot snapshot);

    /** 양끝 포함. 저장된 점이 없으면 빈 목록. */
    List<Snapshot> range(long userId, LocalDate from, LocalDate to);
}
