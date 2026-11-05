package com.assetflow.assets.card.email;

import java.util.List;
import java.util.Optional;

public interface CardEmailImportSettingsLedger {

    CardEmailImportSettings save(CardEmailImportSettings settings);

    Optional<CardEmailImportSettings> findByUserIdAndCardCompany(Long userId, String cardCompany);

    List<CardEmailImportSettings> findByUserId(Long userId);

    List<CardEmailImportSettings> findEnabled();

    void delete(Long userId, String cardCompany);
}
