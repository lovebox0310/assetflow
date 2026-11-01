# 🚨 진짜 문제 발견!!

**발견 시간**: 2026-11-01 21:40  
**상황**: 운영 서버 데이터 격리 문제

---

## 📊 테스트 결과

### 1️⃣ 첫 번째 회원가입: `lovebox0310@gmail.com`
```bash
POST /api/v1/auth/signup
응답: 200 OK, JWT token 발급
```

토큰으로 대시보드 조회:
```json
{
  "assets": [
    { "id": "1", "type": "cash", "name": "우리 파킹통장", "value": 18500000 },
    { "id": "2", "type": "cash", "name": "씨티 요구불", "value": 6200000 },
    { "id": "3", "type": "deposit", "name": "우리 예적금", "value": 42000000 },
    { "id": "4", "type": "invest", "name": "키움 투자금", "value": 78892500 },
    { "id": "5", "type": "invest", "name": "미국주식", "value": 44901900 },
    { "id": "6", "type": "realty", "name": "실거주 아파트", "value": 640000000 }
  ],
  "liabilities": [
    { "id": "7", "name": "주택담보대출", "balance": 69355560 }
  ]
}
```

✅ **데이터 있음!**

### 2️⃣ 두 번째 회원가입: `test2@test.com`
```bash
POST /api/v1/auth/signup
응답: 200 OK, JWT token 발급
```

토큰으로 대시보드 조회:
```json
{
  "assets": [
    { "id": "1", "type": "cash", "name": "우리 파킹통장", "value": 18500000 },
    { "id": "2", "type": "cash", "name": "씨티 요구불", "value": 6200000 },
    ... (완전히 동일한 데이터)
  ]
}
```

✅ **동일한 데이터!**

---

## 🔴 **진짜 문제: 사용자 데이터 격리 없음**

### 현재 상황

모든 사용자가 **같은 `user_id=1`의 데이터**를 공유하고 있습니다!

| 사용자 | user_id | 계좌 | 지출 | 대시보드 |
|--------|---------|------|------|---------|
| lovebox0310@gmail.com | ? | ✅ 18개월 데이터 | ✅ (미확인) | ✅ 총자산 890M |
| test2@test.com | ? | ✅ **동일** | ✅ **동일** | ✅ **동일** |
| (다른 신규 사용자) | ? | ✅ **동일** | ✅ **동일** | ✅ **동일** |

### 원인

1. **PostgresAssetLedger.java** 에서 하드코딩된 OWNER_EMAIL 사용
2. 또는 회원가입 시 `user_id` 할당이 누락됨
3. 모든 쿼리가 `WHERE user_id = 1` 고정

```java
// 예상 코드
List<AssetAccount> accounts = jdbcTemplate.query(
    "SELECT * FROM asset_accounts WHERE user_id = 1",  // ← 모든 사용자가 1
    mapper
);
```

---

## 💡 **해결**

### 즉시 확인할 사항

1. **users 테이블에 실제로 데이터가 있는가?**
   ```sql
   SELECT COUNT(*) FROM users;
   SELECT email FROM users LIMIT 10;
   ```

2. **signup() 메서드가 user_id를 제대로 반환하는가?**
   ```java
   // PostgresAuthService.signup()
   // INSERT 후 id 를 받아야 함
   ```

3. **API 응답의 data.user_id는 무엇인가?**
   ```json
   {
     "data": {
       "token": "...",
       "userId": ???  // 없음?
     }
   }
   ```

### 근본 해결

#### Option A: JWT Subject를 email 대신 user_id로 변경
```java
// TokenService.issue(email) → TokenService.issue(userId)
String token = tokenService.issue(newUserId);  // email 대신 user_id
```

#### Option B: 회원가입 응답에 user_id 포함
```java
{
  "data": {
    "token": "...",
    "userId": 1,
    "expiresAt": ...
  }
}
```

#### Option C: 모든 API에서 JWT subject를 user_id로 파싱
```java
// BearerTokenInterceptor.java
String userId = tokenService.extractUserId(token);  // email → id로 변환
```

---

## ⚠️ **현재 상태**

✅ **회원가입 + 로그인**: 작동  
✅ **토큰 발급**: 작동  
❌ **사용자 데이터 격리**: 완전히 실패  

**모든 사용자가 같은 데이터를 본다!**

---

## 🎯 **즉시 조치**

### 1단계: users 테이블 확인
```bash
ssh redbox9@redbox9.iptime.org
sudo su - postgres
psql -d assetflow

SELECT * FROM users;
SELECT * FROM users WHERE email = 'lovebox0310@gmail.com';
SELECT * FROM users WHERE email = 'test2@test.com';
```

### 2단계: AuthService.signup() 확인
- user_id를 별도로 반환하는가?
- 토큰에 어떤 정보가 들어가는가?

### 3단계: 모든 API에서 사용자 식별 방법 확인
```java
// AuthEmailResolver.java 또는 TokenService.java
// email로부터 user_id를 어떻게 가져오는가?
String userId = getUserIdFromEmail(email);
```

---

## 📋 **확인해야 할 파일**

| 파일 | 확인사항 |
|------|---------|
| `AuthService.java` | signup() 반환값 |
| `PostgresAuthService.java` | INSERT 후 id 처리 |
| `TokenService.java` | JWT subject 설정 |
| `BearerTokenInterceptor.java` | 토큰 파싱 방법 |
| `PostgresAssetLedger.java` | user_id 필터링 |
| `AuthEmailResolver.java` | email → user_id 변환 |
| `LoginResponse.java` | 응답에 user_id 포함? |

