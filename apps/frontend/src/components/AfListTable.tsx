import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Button, Dropdown, Popconfirm } from "antd";
import type { MenuProps } from "antd";

/**
 * 단일 행 목록 체계(A안).
 *
 * 표는 데스크톱·모바일에서 **같은 DOM** 이다. 좁은 폭에서는 CSS 가
 * `thead` 를 clip 으로 숨기고(접근성 트리에는 남긴다) 행을 grid 로 재배치한다.
 * 그래서 화면 폭과 무관하게 `role="table"` 이 존재하고, jsdom 단위 테스트는
 * 데스크톱 DOM 을 본다.
 *
 * - 행 탭 = primary 셀의 버튼(모바일에서는 `::after` 로 행 전체를 덮는다)
 * - 행 동작 = `⋯` → Dropdown 메뉴. 삭제처럼 확인이 필요한 동작은 Popconfirm 경유
 * - 편집 = 편집 행(`colSpan` 셀 하나)으로 교체
 */
export type AfMobileSlot = "primary" | "value" | "meta";

/**
 * 편집 셀이 하단 고정 탭바에 가리지 않게 문서 스크롤을 보정한다(#45).
 *
 * Chrome 은 포커스 스크롤에 `scroll-margin` 을 적용하지 않는다(§122 C-02 실측).
 * 그래서 초점을 받은 입력(작다)만 뷰포트에 맞춰지고, 편집 셀의 아래쪽은 탭바
 * 뒤에 남는다(실측 320×568: 셀 462~572, 탭바 511~568 → 59px 가림).
 *
 * - 탭바 높이는 CSS 변수가 아니라 **실제 높이**를 읽는다. 탭바가 없는
 *   데스크톱(768+)은 0 이고, 그때 셀이 이미 뷰포트 안이면 초과분 ≤ 0 이라
 *   스크롤하지 않는다 — 마우스 클릭 진입이 튀지 않는 이유다(§122 AC-6).
 * - 멱등이다. Chrome 이 포커스 이벤트 뒤에 자기 스크롤을 수행할 수 있어
 *   (카드내역 C-02 와 같은 이유) rAF 두 프레임에 걸쳐 다시 맞춘다.
 */
function keepEditorCellVisible(group: HTMLElement | null) {
  if (!group) return;
  const fix = () => {
    if (!group.isConnected) return;
    // 셀 자체의 아래쪽이 기준이다 — `role="group"` 은 셀 안쪽 여백만큼 작다.
    const cell = group.closest("td") ?? group;
    const tabbar = document.querySelector<HTMLElement>(".af-tabbar");
    const inset = tabbar?.getBoundingClientRect().height ?? 0;
    const below = cell.getBoundingClientRect().bottom - (window.innerHeight - inset);
    if (below > 0) window.scrollBy(0, below + 8);
  };
  fix();
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      fix();
      requestAnimationFrame(fix);
    });
  }
}

export interface AfListColumn<T> {
  key: string;
  /** `<th scope="col">` 텍스트. 모바일에서는 `data-label` 로도 붙는다. */
  header: string;
  align?: "start" | "end";
  /** 데스크톱 열 폭. 숫자 열엔 지정하지 않는다. */
  width?: number | string;
  /** 우측정렬 + tabular-nums + nowrap */
  numeric?: boolean;
  /** primary 1개, value 1개, 나머지 meta */
  mobile?: AfMobileSlot;
  render: (row: T) => ReactNode;
}

export interface AfRowAction {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  /** 있으면 Popconfirm 경유 */
  confirm?: string;
  onSelect: () => void;
}

export interface AfListTableProps<T> {
  /** 화면에 존재하는 h2 의 id. `ariaLabel` 을 주면 쓰지 않는다. */
  labelledBy?: string;
  /**
   * `aria-label` 로 표 이름을 준다. 계좌별 표처럼 화면에 제목 요소가 없을 때 쓴다.
   * `aria-label` 과 `aria-labelledby` 는 동시에 쓰지 않는다.
   */
  ariaLabel?: string;
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  columns: readonly AfListColumn<T>[];
  onActivate?: (row: T) => void;
  /** onActivate 가 있으면 필수 */
  activateLabel?: (row: T) => string;
  /**
   * primary 셀에서 행 탭 버튼 **밖**, 버튼과 같은 줄에 렌더한다. 배지·태그용.
   *
   * 버튼 안에 넣으면 버튼의 접근 이름(aria-label)이 보이는 텍스트 전체를 담지
   * 않아 `label-content-name-mismatch`(serious) 가 난다 — 배지는 버튼 밖에 둔다.
   */
  primaryExtra?: (row: T) => ReactNode;
  /** 모바일 2행. aria-hidden */
  rowSubtitle?: (row: T) => ReactNode;
  actions?: (row: T) => AfRowAction[];
  actionsLabel?: (row: T) => string;
  editingKey?: string | number | null;
  renderEditor?: (row: T) => ReactNode;
  editorLabel?: (row: T) => string;
  /** 편집 행에서 Esc 를 누르면 호출한다. 호출부가 편집 상태를 닫는다. */
  onCancelEdit?: () => void;
  footer?: ReactNode;
  density?: "default" | "dense";
  className?: string;
  style?: CSSProperties;
}

export function AfListTable<T>({
  labelledBy,
  ariaLabel,
  rows,
  rowKey,
  columns,
  onActivate,
  activateLabel,
  primaryExtra,
  rowSubtitle,
  actions,
  actionsLabel,
  editingKey,
  renderEditor,
  editorLabel,
  onCancelEdit,
  footer,
  density = "default",
  className,
  style,
}: AfListTableProps<T>) {
  /** 열린 `⋯` 메뉴는 행별로 하나만 — aria-expanded 도 이 값으로 동기화한다. */
  const [openKey, setOpenKey] = useState<string | number | null>(null);
  /**
   * 확인이 필요한 동작(Popconfirm)의 대상. 메뉴 항목을 누르면 메뉴가 닫히며
   * 그 안의 앵커가 사라지므로, 액션 셀에 1×1 앵커를 따로 두고 `open` 을 제어한다.
   */
  const [confirmTarget, setConfirmTarget] = useState<{
    row: string | number;
    action: string;
  } | null>(null);
  /** 편집 종료 후 포커스를 돌려줄 행 탭 버튼. */
  const editButtonRefs = useRef(new Map<string | number, HTMLButtonElement>());
  const prevEditingKey = useRef<string | number | null>(null);
  /**
   * 행 `⋯` 버튼. 메뉴·Popconfirm 이 닫힐 때 포커스를 되돌릴 대상이다.
   * antd 는 Popconfirm 을 1×1 앵커에 붙이므로, 닫히면 포커스가 트리거가 아닌
   * 앵커(포커스 불가)나 body 로 흘러간다 — 그래서 우리가 받아 온다.
   */
  const menuButtonRefs = useRef(new Map<string | number, HTMLButtonElement>());
  /**
   * `⋯` 메뉴가 **항목 선택** 때문에 닫히는 중인지.
   *
   * 항목 선택은 다른 UI(편집 행·모달·확인 팝업)를 여는 동작이고, 그 UI 가
   * 자기 포커스를 관리한다. 메뉴가 스스로 닫히는 경우(Esc·바깥 클릭)에만
   * 트리거로 포커스를 돌려준다 — 선택 직후 트리거로 포커스를 옮기면 방금 연
   * 팝업의 키보드 조작(Esc 로 닫기)이 끊긴다.
   */
  const menuSelectedRef = useRef(false);

  /** 편집 셀의 `role="group"` — 열 때 안쪽 첫 포커서블을 찾는 기준점. */
  const editorGroupRef = useRef<HTMLDivElement | null>(null);

  /**
   * 편집 행 전환에 맞춰 포커스를 옮긴다.
   *
   * - **진입**(null → 값): 편집 셀 안의 첫 포커서블(입력·Select)로 옮긴다.
   *   그러지 않으면 편집을 연 행 탭 버튼이 DOM 에서 사라진 뒤 포커스가 body 로
   *   흘러가, 첫 Esc 가 아무 일도 하지 않는다(§122 C-10). 포커서블이 없으면
   *   `role="group"`(tabIndex -1)로 받는다.
   * - **종료**(값 → null): 직전 행의 탭 버튼으로 되돌린다. 복귀 렌더가 커밋된
   *   뒤(effect) 새로 붙은 버튼을 찾아 focus 한다 — 그래야 Esc 1회로 끝난다.
   *
   * 가로 스크롤은 브라우저 기본 동작에 맡긴다(입력이 뷰포트에 보여야 한다).
   * 세로는 그것으로 부족하다 — 초점은 입력에만 가고 편집 셀 하단은 하단 탭바에
   * 가리므로, 셀 기준으로 한 번 더 맞춘다(`keepEditorCellVisible`, #45).
   */
  useEffect(() => {
    const prev = prevEditingKey.current;
    const next = editingKey ?? null;
    prevEditingKey.current = next;
    if (prev === next) return;
    if (next === null) {
      if (prev !== null) editButtonRefs.current.get(prev)?.focus();
      return;
    }
    const group = editorGroupRef.current;
    if (!group) return;
    const firstFocusable = group.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (firstFocusable ?? group).focus();
    keepEditorCellVisible(group);
  }, [editingKey]);

  /**
   * 오버레이가 닫힌 뒤 그 행의 `⋯` 로 포커스를 돌려준다. 행이 사라졌으면
   * (삭제 성공 등) ref 가 비어 있어 아무 일도 하지 않는다 — 남은 행을 억지로
   * 고르지 않는다.
   */
  const focusMenuButton = (key: string | number) => {
    menuButtonRefs.current.get(key)?.focus();
  };

  const primaryKey = columns.find((c) => c.mobile === "primary")?.key ?? columns[0]?.key;
  const valueKey = columns.find((c) => c.mobile === "value")?.key;
  const columnCount = columns.length + (actions ? 1 : 0);

  const rootClass = ["af-list", density === "dense" ? "af-list--dense" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} style={style}>
      <table
        role="table"
        className="af-list__table"
        aria-labelledby={ariaLabel ? undefined : labelledBy}
        aria-label={ariaLabel}
      >
        <thead role="rowgroup" className="af-list__thead">
          <tr role="row">
            {columns.map((col) => {
              const thStyle: CSSProperties | undefined = col.numeric
                ? { textAlign: "right" }
                : col.width !== undefined
                  ? { width: col.width }
                  : undefined;
              return (
                <th
                  key={col.key}
                  scope="col"
                  role="columnheader"
                  className={col.numeric ? "af-list__th af-list__th--num" : "af-list__th"}
                  style={thStyle}
                >
                  {col.header}
                </th>
              );
            })}
            {actions ? (
              <th scope="col" role="columnheader" className="af-list__th af-list__th--actions">
                <span className="sr-only">행 동작</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody role="rowgroup" className="af-list__tbody">
          {rows.map((row) => {
            const key = rowKey(row);
            const editing = editingKey !== null && editingKey !== undefined && editingKey === key;

            if (editing) {
              return (
                <tr
                  key={`edit:${String(key)}`}
                  role="row"
                  className="af-list__row af-list__row--editing"
                  /*
                   * capture 단계다 — antd Select 내부 input 이 Escape 를 처리하며 전파를
                   * 막기 때문에 bubble(onKeyDown) 로는 편집 행까지 오지 않는다.
                   * 열린 팝업(Select/Dropdown)이 있으면 그쪽에 양보한다:
                   * "Esc = 드롭다운 먼저 닫기, 그 다음 편집 종료".
                   */
                  onKeyDownCapture={(e) => {
                    if (e.key !== "Escape") return;
                    const openPopup = document.querySelector(
                      ".ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden)",
                    );
                    if (openPopup) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onCancelEdit?.();
                  }}
                >
                  {/* 편집 행은 셀 하나(colSpan) — actions 열과 겹치지 않는다. */}
                  <td role="cell" className="af-list__cell af-list__cell--editor" colSpan={columnCount}>
                    <div role="group" tabIndex={-1} ref={editorGroupRef} aria-label={editorLabel ? editorLabel(row) : undefined}>
                      {renderEditor ? renderEditor(row) : null}
                    </div>
                  </td>
                </tr>
              );
            }

            const rowActions = actions ? actions(row) : [];
            const menuItems: NonNullable<MenuProps["items"]> = rowActions.map((action) => ({
              key: action.key,
              label: action.label,
              ...(action.danger ? { danger: true } : {}),
              ...(action.disabled ? { disabled: true } : {}),
            }));
            const onMenuClick: MenuProps["onClick"] = ({ key: clicked }) => {
              const action = rowActions.find((a) => a.key === clicked);
              if (!action || action.disabled) return;
              /*
               * 이 닫힘은 "선택"이다 — 확인 팝업·편집 행·모달이 이어서 열리고
               * 그 UI 가 포커스를 갖는다. 그래서 트리거로 포커스를 되돌리지 않는다.
               * (비활성 항목은 위에서 걸러지므로 플래그를 세우지 않는다.)
               */
              menuSelectedRef.current = true;
              // 확인이 필요한 동작은 액션 셀의 앵커 Popconfirm 을 연다.
              if (action.confirm) setConfirmTarget({ row: key, action: action.key });
              else action.onSelect();
            };

            // 2행(보조줄) 유무. 모바일에서 이 줄은 행 전체 폭을 쓴다(행 클래스로 CSS 분기).
            const sub = rowSubtitle ? rowSubtitle(row) : null;
            const hasSub = sub !== null && sub !== undefined && sub !== false;

            return (
              <tr role="row" key={key} className={`af-list__row${hasSub ? " af-list__row--sub" : ""}`}>
                {columns.map((col) => {
                  const isPrimary = col.key === primaryKey;
                  const cellClass = ["af-list__cell"];
                  if (col.numeric) cellClass.push("af-list__cell--num");
                  if (isPrimary) cellClass.push("af-list__cell--primary");
                  if (col.key === valueKey) cellClass.push("af-list__cell--value");
                  const content = col.render(row);
                  const extra = isPrimary && primaryExtra ? primaryExtra(row) : null;
                  return (
                    <td
                      key={col.key}
                      role="cell"
                      className={cellClass.join(" ")}
                      data-label={col.header}
                    >
                      {isPrimary ? (
                        <>
                          {onActivate ? (
                            <button
                              type="button"
                              className="af-list__edit"
                              /* A15: 잘린 이름을 마우스로도 읽을 수 있게 native tooltip 을 준다. */
                              title={
                                typeof content === "string" || typeof content === "number"
                                  ? String(content)
                                  : undefined
                              }
                              aria-label={activateLabel ? activateLabel(row) : undefined}
                              onClick={() => onActivate(row)}
                              ref={(el) => {
                                if (el) editButtonRefs.current.set(key, el);
                                else editButtonRefs.current.delete(key);
                              }}
                            >
                              {content}
                            </button>
                          ) : (
                            content
                          )}
                          {extra ? (
                            <span className="af-list__extra">{extra}</span>
                          ) : null}
                        </>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
                {actions ? (
                  <td role="cell" className="af-list__cell af-list__cell--actions">
                    {rowActions.length > 0 ? (
                      <Dropdown
                        trigger={["click"]}
                        open={openKey === key}
                        onOpenChange={(open) => {
                          setOpenKey(open ? key : null);
                          if (open) {
                            menuSelectedRef.current = false;
                            return;
                          }
                          /*
                           * 항목 선택으로 닫혔으면 다른 UI 가 포커스를 갖는다.
                           * Esc·바깥 클릭으로 닫혔으면 트리거(`⋯`)로 돌려준다.
                           * (antd 가 이미 돌려주는 경우도 있다 — 같은 대상이라 무해.)
                           */
                          if (menuSelectedRef.current) {
                            menuSelectedRef.current = false;
                            return;
                          }
                          focusMenuButton(key);
                        }}
                        menu={{ items: menuItems, onClick: onMenuClick }}
                      >
                        <Button
                          type="text"
                          size="small"
                          className="af-icon-btn"
                          aria-haspopup="menu"
                          aria-expanded={openKey === key}
                          aria-label={actionsLabel ? actionsLabel(row) : undefined}
                          ref={(el) => {
                            if (el) menuButtonRefs.current.set(key, el as HTMLButtonElement);
                            else menuButtonRefs.current.delete(key);
                          }}
                        >
                          <span aria-hidden="true">⋯</span>
                        </Button>
                      </Dropdown>
                    ) : null}
                    {/* Popconfirm 앵커: 메뉴가 닫혀도 살아 있는 1×1 지점. */}
                    {rowActions
                      .filter((action) => action.confirm)
                      .map((action) => (
                        <Popconfirm
                          key={`confirm:${action.key}`}
                          title={action.confirm}
                          open={confirmTarget?.row === key && confirmTarget.action === action.key}
                          onConfirm={() => {
                            setConfirmTarget(null);
                            action.onSelect();
                            focusMenuButton(key);
                          }}
                          onCancel={() => {
                            setConfirmTarget(null);
                            focusMenuButton(key);
                          }}
                          onOpenChange={(open) => {
                            if (!open) {
                              setConfirmTarget(null);
                              focusMenuButton(key);
                            }
                          }}
                          /*
                           * 앵커가 표 오른쪽 끝(1×1)이라 기본 `top`(가운데 정렬)은
                           * 팝업 절반이 뷰포트 밖으로 나간다 — 320/375 실측에서
                           * 오른쪽으로 5.6px 넘쳤다. `topRight` 는 팝업 오른쪽 끝을
                           * 트리거(표 안, 항상 뷰포트 안)에 맞추므로 넘치지 않는다.
                           */
                          placement="topRight"
                          /* A12: 확인/취소는 손가락 히트 44 이상(§78). */
                          okButtonProps={{ style: { minHeight: 44, minWidth: 44 } }}
                          cancelButtonProps={{ style: { minHeight: 44, minWidth: 44 } }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "50%",
                              width: 1,
                              height: 1,
                            }}
                          />
                        </Popconfirm>
                      ))}
                  </td>
                ) : null}
                {/* 2행(보조줄)은 흐름의 별도 셀 — 모바일 grid 2행 전체 폭을 차지한다.
                    데스크톱은 display:none 이라 열 수·열 정렬에 영향이 없다(th 없음). */}
                {hasSub ? (
                  <td className="af-list__cell af-list__cell--sub" aria-hidden="true">
                    <div className="af-list__sub">{sub}</div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer !== undefined && footer !== null ? <div className="af-list__summary">{footer}</div> : null}
    </div>
  );
}
