package com.assetflow.assets.bank;

import java.util.List;

/**
 * 자산 계좌 ↔ 은행 빠른조회 연결 원장(§61).
 * 계좌번호는 암호화된 문자열로만 저장하고, 비밀번호·생년월일은 저장하지 않는다.
 */
public interface BankAccountLinkLedger {

    record Link(long accountId,
                String bankCode,
                String accountNumberEncrypted,
                String accountType,
                /** ISO-8601. 아직 동기화한 적이 없으면 null. */
                String lastSyncedAt,
                Long lastBalance) {
    }

    List<Link> all();

    /** 없으면 null. */
    Link byAccountId(long accountId);

    /** accountId 기준 upsert — 같은 계좌를 다시 연결하면 덮어쓴다. */
    Link save(Link link);

    void deleteByAccountId(long accountId);
}
