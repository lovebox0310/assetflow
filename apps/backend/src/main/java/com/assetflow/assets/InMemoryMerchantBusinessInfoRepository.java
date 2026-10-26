package com.assetflow.assets;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Component
@Profile("!postgres")
public class InMemoryMerchantBusinessInfoRepository implements MerchantBusinessInfoRepository {

    private final Map<String, MerchantBusinessInfo> store = new HashMap<>();

    @Override
    public Optional<MerchantBusinessInfo> findByBusinessNo(String businessNo) {
        synchronized (store) {
            return Optional.ofNullable(store.get(businessNo));
        }
    }

    @Override
    public void save(MerchantBusinessInfo info) {
        synchronized (store) {
            store.put(info.businessNo(), info);
        }
    }
}
