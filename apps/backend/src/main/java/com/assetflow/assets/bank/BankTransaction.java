package com.assetflow.assets.bank;

/**
 * 거래내역 1건. 필드 이름·의미는 bankapi.co.kr 응답 계약을 그대로 따른다.
 * balance 는 거래 후 잔액이며 마이너스 통장이면 음수다.
 */
public record BankTransaction(String date,
                              String time,
                              String description,
                              String displayName,
                              String counterparty,
                              long amount,
                              long balance,
                              String type,
                              String branch,
                              String memo) {
}
