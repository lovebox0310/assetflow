package com.assetflow.assets.bank;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.common.api.NotFoundException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * 은행 잔액 동기화 서비스 (§61).
 *
 * 1단계 범위:
 * - 빠른조회(간편조회)가 등록된 **무로그인 4개 은행**만 지원한다(NH·KB·WR·IBK).
 * - 대상은 **현금성(cash)·예적금(deposit)** 계좌뿐이다. 부채·투자·부동산 계좌는 거절한다 —
 *   투자 계좌의 balance 는 예수금이고 총액은 보유종목과 합쳐 계산하므로 은행 잔액으로 덮으면 안 된다.
 * - 연결 시 계좌번호만 암호화해 저장한다. 계좌 비밀번호·생년월일은 요청 처리 동안만 존재한다.
 *
 * 잔액의 단일 출처는 {@link AssetLedger} 하나다 — 동기화는 그 원장의 balance 를 갱신할 뿐,
 * 별도 잔액을 만들지 않는다(§31.1).
 */
@Service
public class BankSyncService {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter BASIC_DATE = DateTimeFormatter.BASIC_ISO_DATE;
    private static final Set<String> SYNCABLE = Set.of("cash", "deposit");
    private static final int DEFAULT_DAYS = 7;
    private static final int MAX_DAYS = 31;

    private final AssetLedger assets;
    private final BankAccountLinkLedger links;
    private final BankInquiryClient client;
    private final BankAccountCipher cipher;

    public BankSyncService(AssetLedger assets,
                           BankAccountLinkLedger links,
                           BankInquiryClient client,
                           BankAccountCipher cipher) {
        this.assets = assets;
        this.links = links;
        this.client = client;
        this.cipher = cipher;
    }

    public record BankOptionView(String code, String label) {
    }

    /** 화면에 내려줄 연결 정보 — 계좌번호는 마스킹해서만 나간다. */
    public record LinkView(long accountId,
                           String bankCode,
                           String bankLabel,
                           String accountNumberMasked,
                           String accountType,
                           String lastSyncedAt,
                           Long lastBalance) {
    }

    public record SyncResult(long accountId,
                             String bankCode,
                             long balance,
                             int transactionCount,
                             BankTransaction latest,
                             String syncedAt) {
    }

    public record LinkResult(LinkView link, SyncResult sync) {
    }

    public record LinkRequest(String bankCode,
                              String accountNumber,
                              String accountPassword,
                              String residentNumber,
                              String accountType) {
    }

    public record SyncRequest(String accountPassword, String residentNumber, Integer days) {
    }

    public List<BankOptionView> banks() {
        return Arrays.stream(BankCode.values())
                .map(bank -> new BankOptionView(bank.name(), bank.label()))
                .toList();
    }

    public List<LinkView> links() {
        return links.all().stream().map(this::view).toList();
    }

    /**
     * 계좌 연결 + 즉시 1회 조회. 잘못된 계좌번호를 저장해 두지 않도록,
     * 연결과 동시에 은행에 조회해 성공한 경우에만 링크를 저장한다.
     */
    public LinkResult link(long accountId, LinkRequest request) {
        AssetRow row = requireSyncable(accountId);
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        BankCode bank = BankCode.of(request.bankCode())
                .orElseThrow(() -> new IllegalArgumentException(
                        "bankCode must be one of NH|KB|WR|IBK"));
        String accountNumber = digits(request.accountNumber());
        if (accountNumber.length() < 6 || accountNumber.length() > 20) {
            throw new IllegalArgumentException("accountNumber must be 6-20 digits");
        }
        String accountType = normalizeAccountType(request.accountType());
        String password = digits(request.accountPassword());
        String resident = digits(request.residentNumber());
        validateCredentials(password, resident, accountType);

        SyncResult sync = queryAndApply(row, bank, accountNumber, password, resident,
                accountType, DEFAULT_DAYS);
        return new LinkResult(view(links.byAccountId(accountId)), sync);
    }

    /** 연결된 계좌의 잔액을 다시 가져온다. 비밀번호·생년월일은 매 요청마다 사용자가 입력한다. */
    public SyncResult sync(long accountId, SyncRequest request) {
        AssetRow row = requireSyncable(accountId);
        BankAccountLinkLedger.Link link = links.byAccountId(accountId);
        if (link == null) {
            throw new NotFoundException("bank link for account id " + accountId);
        }
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        BankCode bank = BankCode.of(link.bankCode())
                .orElseThrow(() -> new IllegalStateException("stored bank code is invalid: " + link.bankCode()));
        String accountNumber;
        try {
            accountNumber = cipher.decrypt(link.accountNumberEncrypted());
        } catch (RuntimeException e) {
            // 암호화 키가 바뀌면(JWT_SECRET 교체 등) 기존 연결을 읽을 수 없다.
            // 목록은 계속 보여 주고, 동기화만 명확한 안내로 막는다.
            throw new BankApiException("BANK_LINK_UNREADABLE",
                    "저장된 계좌번호를 복호화할 수 없습니다. 연결을 해제하고 다시 연결해 주세요.");
        }
        String password = digits(request.accountPassword());
        String resident = digits(request.residentNumber());
        validateCredentials(password, resident, link.accountType());
        int days = request.days() == null ? DEFAULT_DAYS : Math.max(1, Math.min(MAX_DAYS, request.days()));
        return queryAndApply(row, bank, accountNumber, password, resident, link.accountType(), days);
    }

    public void unlink(long accountId) {
        if (assets.byId(accountId) == null) {
            throw new NotFoundException("account id " + accountId);
        }
        links.deleteByAccountId(accountId);
    }

    private SyncResult queryAndApply(AssetRow row, BankCode bank, String accountNumber,
                                     String password, String resident, String accountType, int days) {
        LocalDate end = LocalDate.now(SEOUL);
        LocalDate start = end.minusDays(days - 1L);
        BankQuery query = new BankQuery(bank, accountNumber, password, resident, accountType,
                start.format(BASIC_DATE), end.format(BASIC_DATE));
        BankQueryResult result = client.query(query);

        if (result.balance() < 0) {
            // asset_accounts.balance 는 음수를 허용하지 않는다(CHECK). 마이너스 통장은 부채로
            // 등록해야 하므로, 여기서 조용히 0 으로 만들지 않고 이유를 알린다.
            throw new IllegalArgumentException(
                    "은행 잔액이 음수입니다(" + result.balance() + "원). 마이너스 통장은 부채로 등록하고 "
                            + "이 계좌는 은행 연결에 쓰지 마세요.");
        }

        assets.update(row.id(), row.accountType(), row.name(), row.institutionName(),
                result.balance(), row.isDebt(), row.openedAt());

        String syncedAt = Instant.now().toString();
        links.save(new BankAccountLinkLedger.Link(row.id(), bank.name(),
                cipher.encrypt(accountNumber), accountType, syncedAt, result.balance()));

        return new SyncResult(row.id(), bank.name(), result.balance(),
                result.transactions().size(), latestOf(result.transactions()), syncedAt);
    }

    private AssetRow requireSyncable(long accountId) {
        AssetRow row = assets.byId(accountId);
        if (row == null) {
            throw new NotFoundException("account id " + accountId);
        }
        if (row.isDebt()) {
            throw new IllegalArgumentException("부채 계좌는 은행 잔액 동기화 대상이 아닙니다");
        }
        if (!SYNCABLE.contains(row.accountType())) {
            throw new IllegalArgumentException(
                    "은행 잔액 동기화는 현금성(cash)·예적금(deposit) 계좌만 지원합니다");
        }
        return row;
    }

    private LinkView view(BankAccountLinkLedger.Link link) {
        if (link == null) return null;
        // 복호화 실패가 목록 전체를 막지 않게 한다 — 마스킹 값만 비우고 연결은 보여 준다.
        String masked;
        try {
            masked = BankAccountCipher.mask(cipher.decrypt(link.accountNumberEncrypted()));
        } catch (RuntimeException e) {
            masked = "****";
        }
        String label = BankCode.of(link.bankCode()).map(BankCode::label).orElse(link.bankCode());
        return new LinkView(link.accountId(), link.bankCode(), label,
                masked, link.accountType(), link.lastSyncedAt(), link.lastBalance());
    }

    /** 날짜 형식이 YYYY-MM-DD / YYYY/MM/DD 로 갈려도 최신 1건을 고른다. */
    private static BankTransaction latestOf(List<BankTransaction> transactions) {
        if (transactions == null || transactions.isEmpty()) return null;
        return transactions.stream()
                .max(Comparator.comparing(t -> (nz(t.date()).replace('/', '-') + " " + nz(t.time()))))
                .orElse(null);
    }

    private static String nz(String value) {
        return value == null ? "" : value;
    }

    private static String normalizeAccountType(String value) {
        if (value == null || value.isBlank()) return "personal";
        String normalized = value.trim().toLowerCase(java.util.Locale.ROOT);
        if (!normalized.equals("personal") && !normalized.equals("business")) {
            throw new IllegalArgumentException("accountType must be personal|business");
        }
        return normalized;
    }

    private static void validateCredentials(String password, String resident, String accountType) {
        if (password.length() != 4) {
            throw new IllegalArgumentException("accountPassword must be 4 digits");
        }
        int expected = "business".equals(accountType) ? 7 : 6;
        if (resident.length() != expected) {
            throw new IllegalArgumentException("residentNumber must be " + expected + " digits");
        }
    }

    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }
}
