package com.assetflow.assets.bank;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 은행 연결 원장의 인메모리 구현. postgres 프로필이 아닌 환경(테스트·CI)의 기본값.
 * 프로세스를 재시작하면 연결이 사라진다 — 로컬 개발·테스트 전용이다.
 */
@Component
@Profile("!postgres")
public class InMemoryBankAccountLinkLedger implements BankAccountLinkLedger {

    private final Map<Long, Link> rows = new LinkedHashMap<>();

    @Override
    public synchronized List<Link> all() {
        return new ArrayList<>(rows.values());
    }

    @Override
    public synchronized Link byAccountId(long accountId) {
        return rows.get(accountId);
    }

    @Override
    public synchronized Link save(Link link) {
        rows.put(link.accountId(), link);
        return link;
    }

    @Override
    public synchronized void deleteByAccountId(long accountId) {
        rows.remove(accountId);
    }
}
