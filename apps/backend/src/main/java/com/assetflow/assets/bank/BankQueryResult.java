package com.assetflow.assets.bank;

import java.time.Instant;
import java.util.List;

/**
 * 빠른조회 1회의 결과. 은행이 알려 준 잔액(accountInfo.balance)이 권위값이고,
 * transactions 는 조회 기간 안의 거래내역이다 — 저장하지 않고 응답으로만 쓴다.
 */
public record BankQueryResult(String accountNumber,
                              long balance,
                              String accountName,
                              String accountHolder,
                              List<BankTransaction> transactions,
                              Instant fetchedAt) {
}
