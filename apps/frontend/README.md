# frontend workspace

Frontend implementation area for AssetFlow.

## Stack (confirmed, §1 of `.ai/project.md`)

- React 18 + TypeScript (strict) + Vite
- 테스트: Vitest + Testing Library (jsdom)
- 패키지 매니저: **pnpm 단독** (§30). 락 파일은 `pnpm-lock.yaml` 만 허용합니다.
  `package-lock.json` / `yarn.lock` 을 만들지 마세요.
- `package.json` 의 `packageManager` 필드가 pnpm major 를 고정합니다.
  corepack 은 이 필드를 읽어 같은 버전을 씁니다.

## Commands

```bash
corepack pnpm install
corepack pnpm run dev        # 로컬 개발 서버
corepack pnpm run typecheck  # tsc --noEmit
corepack pnpm run test       # vitest run
corepack pnpm run build      # 타입 검사 후 프로덕션 빌드
```

`pnpm` 이 PATH 에 없으면 `corepack pnpm` 으로 대신합니다.

## Status

| 항목 | 상태 |
|---|---|
| 빌드·타입 검사·테스트 | 동작 (테스트 8건) |
| 로그인 화면 | 스켈레톤 (백엔드 미연동, `authApi` 는 모크) |
| 대시보드 화면 | 자리표시자 |
| 자산·부채 화면 | 아직 없음. 프로토타입 `design/prototype/assets.html` 을 옮길 차례 |

## Notes for AI collaboration

- 새 화면은 `src/pages/` 에 두고, `App.tsx` 에서 라우팅 없이 상태로 전환합니다
  (라우터는 필요해지면 도입합니다).
- 화면을 옮길 때는 `design/prototype/` 의 HTML/CSS/로직이 단일 출처입니다.
  값을 다시 계산하지 말고, 계산은 공용 함수로 빼서 양쪽이 같은 코드를 씁니다
  (§34.6 원칙: 계산이 두 곳이면 한쪽만 맞는다).
- `pnpm run build` 는 PR 전에 돌려 타입·빌드 오류를 잡습니다.
