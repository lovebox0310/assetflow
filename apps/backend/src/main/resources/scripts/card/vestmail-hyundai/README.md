# 현대카드 VestMail 이메일 명세서 추출기

AssetFlow 백엔드에서 호출하는 Node.js 보조 스크립트입니다.
현대카드가 이메일로 본인확인 후 발송하는 VestMail 암호화 HTML 명세서를
Playwright 브라우저에서 복호화하고, 거래 내역을 `samples/card/card-columns.json`
규격의 JSON으로 변환합니다.

## 설치

```bash
cd apps/backend/src/main/resources/scripts/card/vestmail-hyundai
npm install
npx playwright install chromium
```

## 사용법

```bash
node extract-hyundai-vestmail.mjs <input.html> [--password=...] [--year=YYYY]
```

비밀번호는 우선순위대로 적용됩니다:

1. `--password=...` 인자
2. `HYUNDAI_VESTMAIL_PASSWORD` 환경변수
3. 대화형 입력

## 출력

`<input>_extracted.json` 파일을 생성하고, 동시에 stdout에 JSON을 출력합니다.

## 보안

- 비밀번호는 평문으로 파일이나 로그에 남지 않도록 주의해야 합니다.
- AssetFlow 백엔드는 이 스크립트를 프로세스로 실행할 때, 메모리에서만 비밀번호를
  전달해야 합니다.
- 서버에 저장되는 VestMail 비밀번호는 반드시 암호화해야 합니다(§63.6).
