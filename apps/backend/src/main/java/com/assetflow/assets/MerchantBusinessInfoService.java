package com.assetflow.assets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 사업자번호로 사업자 정보를 조회한다.
 *
 * <p>한 번 조회한 정보는 DB(merchant_business_info)에 캐시한다. bizno.net 은 같은 IP 에서
 * 짧은 시간에 여러 번 부르면 "접속대기" 페이지로 막히므로 캐시가 필수다.
 * 캐시가 오래됐어도 새로 긁기에 실패하면 있는 값을 그대로 돌려준다.</p>
 */
@Service
public class MerchantBusinessInfoService {

    private static final Logger log = LoggerFactory.getLogger(MerchantBusinessInfoService.class);
    private static final Pattern TEN_DIGITS = Pattern.compile("\\d{10}");
    private static final Duration FRESH_FOR = Duration.ofDays(30);

    private final MerchantBusinessInfoRepository repository;
    private final BiznoScraper scraper;

    public MerchantBusinessInfoService(MerchantBusinessInfoRepository repository, BiznoScraper scraper) {
        this.repository = repository;
        this.scraper = scraper;
    }

    /** 조회 결과와 캐시 여부. */
    public record Lookup(MerchantBusinessInfo info, boolean cached) {}

    public Lookup lookup(String rawBusinessNo) {
        String businessNo = normalize(rawBusinessNo);
        if (!TEN_DIGITS.matcher(businessNo).matches()) {
            throw new IllegalArgumentException("businessNo must be 10 digits");
        }

        Optional<MerchantBusinessInfo> cached = repository.findByBusinessNo(businessNo);
        if (cached.isPresent() && isFresh(cached.get())) {
            return new Lookup(cached.get(), true);
        }

        try {
            MerchantBusinessInfo scraped = scraper.scrape(businessNo);
            repository.save(scraped);
            return new Lookup(scraped, false);
        } catch (BiznoUnavailableException e) {
            if (cached.isPresent()) {
                log.warn("bizno.net unavailable for {} — serving cached copy", businessNo, e);
                return new Lookup(cached.get(), true);
            }
            throw e;
        }
    }

    private static boolean isFresh(MerchantBusinessInfo info) {
        Instant fetchedAt = info.fetchedAt();
        return fetchedAt != null && fetchedAt.isAfter(Instant.now().minus(FRESH_FOR));
    }

    static String normalize(String raw) {
        return raw == null ? "" : raw.replaceAll("[^0-9]", "");
    }
}
