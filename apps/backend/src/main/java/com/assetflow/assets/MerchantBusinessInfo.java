package com.assetflow.assets;

import java.time.LocalDate;

/**
 * 외부 사이트(bizno.net 등)에서 조회한 사업자 정보 캐시.
 */
public record MerchantBusinessInfo(
        Long id,
        long userId,
        String businessNo,
        String companyName,
        String ceoName,
        String bizType,
        String bizItem,
        String mainProduct,
        String phone,
        String fax,
        String companySize,
        String corporateType,
        String taxType,
        String headquarters,
        String corporateForm,
        LocalDate registeredAt,
        String homepage,
        String irHomepage,
        String email,
        String businessStatus,
        String corporateRegNo,
        Integer employees,
        String zipCode,
        String address,
        String taxOffice,
        Integer fiscalMonth,
        String source,
        java.time.Instant fetchedAt
) {
}
