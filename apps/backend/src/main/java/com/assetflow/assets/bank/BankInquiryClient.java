package com.assetflow.assets.bank;

/**
 * 은행 잔액 조회 클라이언트. 구현(bankapi.co.kr HTTP 호출)과 테스트 대역을 분리한다.
 * 실패는 전부 {@link BankApiException} 으로 올린다 — code 로 분기하고 message 는 화면에 보여 준다.
 */
public interface BankInquiryClient {

    BankQueryResult query(BankQuery query);
}
