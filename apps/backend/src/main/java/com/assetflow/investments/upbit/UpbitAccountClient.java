package com.assetflow.investments.upbit;

import java.util.List;

/**
 * 업비트 계좌(보유 자산) 조회 계약 (UPBIT-2).
 * 구현체는 자산조회(View Account) 권한만 사용하며 주문·출금은 하지 않는다.
 */
public interface UpbitAccountClient {

    List<UpbitAccount> accounts(UpbitCredentials creds);
}
