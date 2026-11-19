import type { CSSProperties } from "react";

/**
 * I-02 모달 헤더 셸 — 4개 모달(KIS 연결 설정 · 채권 진단 · 연금 진단 · 업비트 연동)이
 * 같은 헤더를 쓴다. 예전 값(`20px 24px 0`)은 제목 오른쪽 여백이 24px 뿐이라,
 * 제목이 2줄이 되는 320~430 에서 antd 닫기 버튼과 겹쳤다
 * (실측: 320 에서 제목 right 284 vs 닫기 left 262 → 22px 겹침).
 *
 * 오른쪽 패딩으로 닫기 버튼 자리를 비워 둔다 — 닫기 버튼(32px) + 오른쪽 인셋(16px)
 * + 12px 간격 = 60px. **패딩만** 바뀌므로 헤더 높이(위 20px)와 본문·footer 기하는
 * 그대로다(다른 화면 모달도 이 상수를 쓰지 않으면 영향 없음).
 */
export const modalHeaderStyle: CSSProperties = {
  flex: "0 0 auto",
  padding: "20px 60px 0 24px",
};
