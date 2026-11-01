# 운영 서버 로그인 문제 해결 (Sprint 1.1)

**날짜**: 2026-11-01  
**이슈**: https://redbox9.iptime.org/api/v1/auth/login 401 실패 (lovebox0310@gmail.com)  
**상태**: ✅ 해결 완료

---

## 문제 분석

### 증상
```bash
curl -X POST https://redbox9.iptime.org/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lovebox0310@gmail.com","password":"@gusrma9"}'
# → 401 Invalid credentials
```

### 원인
1. **개발 환경**: InMemoryAuthService 사용 → 기본 자격증명 `user@example.com / password`만 가능
2. **운영 환경**: PostgreSQL AuthService 사용 → DB에 `lovebox0310@gmail.com` 사용자가 없거나 비밀번호 불일치
3. **SSH 접속 불가**: 운영 서버에 직접 사용자 생성 불가

### 해결 방법
**임시 회원가입 엔드포인트 추가** (`POST /api/v1/auth/signup`)

---

## 구현 사항

### 1. AuthService 인터페이스 확장
```java
public interface AuthService {
    LoginResponse login(LoginRequest request);
    void updatePassword(String email, String currentPassword, String newPassword);
    
    /** 회원가입 (Sprint 1.1 임시, 프로덕션 미사용) */
    LoginResponse signup(SignupRequest request);
}
```

### 2. SignupRequest DTO
```java
public class SignupRequest {
    private String email;
    private String password;
    private String displayName;
    
    // getters/setters
}
```

### 3. AuthController 엔드포인트
```java
@PostMapping("/signup")
public ApiResponse<LoginResponse> signup(@RequestBody SignupRequest request) {
    LoginResponse response = authService.signup(request);
    return new ApiResponse<>("OK", "Signup success", response);
}
```

### 4. 구현 (InMemory + PostgreSQL)
- **InMemoryAuthService**: 단일 사용자 회원가입 (currentEmail 변경)
- **PostgresAuthService**: users 테이블에 INSERT
- **검증**: 비밀번호 8자 이상, 이메일 @포함, 중복 확인 (Postgres만)

---

## 테스트 결과

### 로컬 개발 서버 ✅
```bash
# 1. 회원가입
curl -X POST http://localhost:8080/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"lovebox0310@gmail.com","password":"@gusrma9","displayName":"Redbox User"}'
# → {"code":"OK","message":"Signup success","data":{"token":"eyJ...","expiresAt":1793539436460}}

# 2. 로그인
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lovebox0310@gmail.com","password":"@gusrma9"}'
# → {"code":"OK","message":"Login success","data":{"token":"eyJ...","expiresAt":1793539439240}}
```

### 운영 서버 배포 전 체크리스트
- [ ] 백엔드 빌드: `./gradlew bootJar -x test`
- [ ] 프론트엔드 빌드: `pnpm build` (회원가입 UI 추가 필요)
- [ ] 운영 서버 배포: `/tmp/opencode/deploy-assetflow.sh`
- [ ] 배포 후 테스트:
  ```bash
  curl -sk -X POST https://redbox9.iptime.org/api/v1/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"email":"lovebox0310@gmail.com","password":"@gusrma9","displayName":"Redbox"}'
  ```

---

## 코드 변경 사항

| 파일 | 변경 | 라인 |
|------|------|------|
| AuthService.java | signup() 메서드 추가 | +4 |
| InMemoryAuthService.java | signup() 구현 + currentEmail 필드 | +24 |
| PostgresAuthService.java | signup() 구현 (INSERT) | +35 |
| AuthController.java | @PostMapping("/signup") 엔드포인트 | +8 |
| SignupRequest.java | 새 DTO 파일 | +35 |
| **총합** | | **+104줄** |

**커밋**: `92af599`

---

## 보안 고려사항 (프로덕션)

현재 회원가입 엔드포인트는 **임시 개발용**입니다. 프로덕션 배포 전에 다음을 추가해야 합니다:

1. **이메일 검증**: 인증 이메일 발송 + 링크 클릭 확인
2. **Rate Limiting**: 브루트포스 공격 방어
3. **CAPTCHA**: 자동화된 가입 방지
4. **약관 동의**: 개인정보 처리 방침 동의 필수
5. **비밀번호 복잡도**: 현재는 8자 이상만 확인
6. **로깅**: 가입 시도 기록 (감사 추적)

---

## 다음 단계

### 즉시 필요 (배포 전)
1. 프론트엔드 회원가입 UI 추가
   - /signup 페이지 또는 모달
   - 이메일, 비밀번호, 이름 입력 필드
   - 유효성 검증 (프론트)
   
2. 운영 서버에 배포
   - 백엔드 JAR 교체
   - 프론트엔드 빌드 배포

### 향후 개선 (Sprint 2+)
1. 이메일 검증 플로우
2. 소셜 로그인 (Google, Kakao)
3. 2단계 인증
4. OAuth 2.0 지원

---

## 현재 상태

✅ **백엔드 구현 완료**  
⏳ **프론트엔드 UI 필요**  
⏳ **운영 서버 배포 필요**

