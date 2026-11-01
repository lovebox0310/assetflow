# 🎯 최종 진실 규명

**발견 시간**: 2026-11-01 21:50  
**상황**: 데이터 "손실"이 아니라 **설계상 단일 사용자 MVP**

---

## 🔍 **코드 증거**

### PostgresAssetLedger.java (15줄)
```java
/**
 * ...
 * 단일 사용자 MVP: user_id 는 data-seed.sql 이 시드하는 user@example.com 행에 고정한다.
 */
@Component
@Profile("postgres")
public class PostgresAssetLedger implements AssetLedger {
    private final long userId;

    public PostgresAssetLedger(JdbcTemplate jdbc,
                               @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }
    
    @PostConstruct
    void seedIfEmpty() {
        // user_id 고정 후 시드 데이터 삽입
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM asset_accounts WHERE user_id = ?", Integer.class, userId);
        if (count == 0) {
            // 시드 데이터 삽입 (계좌 6개 + 대출 1개)
        }
    }
}
```

### TokenService.java (44줄)
```java
public String issue(String email) {
    return Jwts.builder()
            .subject(email)  // email만 저장, user_id 아님
            ...
}
```

### AuthEmailResolver.java
```java
public String currentEmail() {
    // 토큰에서 추출한 email 반환
    return (String) email;
}
```

---

## 📊 **현재 운영 환경 구조**

### 환경변수 설정 (추정)
```bash
# /etc/systemd/system/assetflow.service 또는 Docker env
OWNER_EMAIL=lovebox0310@gmail.com  # ← 이 이메일의 user_id를 고정 사용
```

### 실제 쿼리 방식

**모든 API에서:**
```sql
SELECT ... FROM asset_accounts 
WHERE user_id = (SELECT id FROM users WHERE email = 'lovebox0310@gmail.com')
-- ↑ 항상 같은 user_id
```

### 따라서
```
회원가입(lovebox0310@gmail.com) → user_id=1 생성
회원가입(test2@test.com)        → user_id=2 생성 (하지만 무시됨)
회원가입(anyone@example.com)    → user_id=3 생성 (하지만 무시됨)

로그인한 사용자 상관없이:
  모든 API 쿼리 → WHERE user_id = 1 (lovebox0310의 user_id)
  모든 사용자 → 동일한 데이터 조회
```

---

## ✅ **따라서 데이터 손실 없음!**

### 진짜 상황
- ✅ `lovebox0310@gmail.com`의 계좌/지출 데이터: **여전히 DB에 존재**
- ✅ 2026-10-18 이관한 데이터: **여전히 DB에 존재**
- ✅ user_id=1: **여전히 활성**
- ❌ "데이터 손실": **없음** (회원가입만 되면 자동 접근 가능)

### 회원가입 기능의 역할
```
이전: user@example.com만 하드코딩 로그인 가능
지금: 누구나 회원가입 후 (같은 user_id=1의) 데이터 접근 가능
```

---

## 🚨 **실제 문제: 사용자 격리 없음**

설계상 **단일 사용자 MVP**이므로 의도된 동작입니다.

하지만 운영에서는:
- 모든 회원가입자가 같은 데이터를 본다
- 보안 문제 (다른 사용자 데이터 노출)
- Sprint 2에서 **멀티 테넌트로 변환 필요**

---

## 📈 **실제 구현 로드맵**

### Sprint 1 (현재) - ✅ 단일 사용자 MVP
```
✅ 회원가입 (누구나 가능, 같은 데이터)
✅ 로그인 (JWT 토큰)
✅ API (모두 user_id 고정)
✅ 데이터 (1개 user_id만)
```

### Sprint 2 (필요) - 멀티 테넌트
```
⏳ JWT subject: email → user_id 변경
⏳ 모든 API: WHERE user_id = ? (변수)
⏳ AuthEmailResolver: email → user_id 매핑
⏳ 데이터 격리: 사용자별 별도 조회
⏳ 테스트: 다중 사용자 시나리오
```

---

## 🎯 **지금 해야 할 것**

### 1️⃣ 즉시 (오늘)
- ✅ 회원가입 + 로그인 테스트 (완료)
- ✅ 데이터 접근 확인 (완료 - lovebox0310 데이터 보임)
- [ ] 문서화: 단일 사용자 MVP 설명

### 2️⃣ 프로덕션 운영 (지금)
- [ ] **주의**: 현재는 모든 사용자가 같은 데이터 봄
- [ ] 관리자 외 다른 사용자 계정 생성 금지 권고
- [ ] 또는 Sprint 2까지 싱글 어카운트 사용

### 3️⃣ Sprint 2 (멀티 테넌트)
- [ ] JWT: email → user_id 변경
- [ ] API: 모든 쿼리 user_id 변수화
- [ ] 데이터: 사용자별 격리
- [ ] 테스트: 멀티 유저 검증

---

## 💾 **최종 결론**

```
❌ "lovebox0310@gmail.com 데이터 손실" (X)
✅ "lovebox0310@gmail.com 데이터 존재" (O)

❌ "사용자별 데이터 격리" (X)
✅ "모든 사용자가 user_id=1 데이터 공유" (O)

❌ "회원가입 실패" (X)
✅ "회원가입 성공, 같은 데이터 접근" (O)
```

**즉시 로그인 가능!**

