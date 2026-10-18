// typescript-eslint flat config (권장 규칙). 스프린트 1 정적 게이트:
// tsc(타입) + eslint(스타일/버그) 를 분리해 둔다.
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/", "node_modules/", "storybook-static/", "coverage/"],
  },
  {
    rules: {
      // 테스트에서 의도적으로 빈 catch 로 정책 메시지를 감추는 곳이 있다(§21).
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
