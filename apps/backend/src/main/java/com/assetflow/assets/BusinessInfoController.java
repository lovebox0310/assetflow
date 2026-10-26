package com.assetflow.assets;

import com.assetflow.common.api.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 사업자번호별 사업자 정보 조회 API.
 *
 * <p>지출 화면에서 사업자번호를 누르면 호출된다. DB 캐시가 있으면 그대로, 없으면
 * bizno.net 에서 읽어 저장한 뒤 돌려준다. bizno.net 이 혼잡하면 503 / BIZNO_BUSY.</p>
 */
@RestController
@RequestMapping("/api/v1/assets")
public class BusinessInfoController {

    private final MerchantBusinessInfoService service;

    public BusinessInfoController(MerchantBusinessInfoService service) {
        this.service = service;
    }

    public record BusinessInfoResponse(
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
            String registeredAt,
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
            String fetchedAt,
            boolean cached) {

        static BusinessInfoResponse of(MerchantBusinessInfo info, boolean cached) {
            return new BusinessInfoResponse(
                    info.businessNo(),
                    info.companyName(),
                    info.ceoName(),
                    info.bizType(),
                    info.bizItem(),
                    info.mainProduct(),
                    info.phone(),
                    info.fax(),
                    info.companySize(),
                    info.corporateType(),
                    info.taxType(),
                    info.headquarters(),
                    info.corporateForm(),
                    info.registeredAt() == null ? null : info.registeredAt().toString(),
                    info.homepage(),
                    info.irHomepage(),
                    info.email(),
                    info.businessStatus(),
                    info.corporateRegNo(),
                    info.employees(),
                    info.zipCode(),
                    info.address(),
                    info.taxOffice(),
                    info.fiscalMonth(),
                    info.source(),
                    info.fetchedAt() == null ? null : info.fetchedAt().toString(),
                    cached);
        }
    }

    @GetMapping("/business-info/{businessNo}")
    public ApiResponse<BusinessInfoResponse> businessInfo(@PathVariable String businessNo) {
        MerchantBusinessInfoService.Lookup lookup = service.lookup(businessNo);
        return new ApiResponse<>("OK", "Business info loaded", BusinessInfoResponse.of(lookup.info(), lookup.cached()));
    }
}
