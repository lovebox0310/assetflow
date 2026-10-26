package com.assetflow.assets;

import java.util.Optional;

public interface MerchantBusinessInfoRepository {
    Optional<MerchantBusinessInfo> findByBusinessNo(String businessNo);
    void save(MerchantBusinessInfo info);
}
