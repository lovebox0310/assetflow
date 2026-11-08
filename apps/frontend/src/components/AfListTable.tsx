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
   * 편집 행이 닫히는 순간(값이 null 로 바뀌는 순간) 직전 행의 탭 버튼으로
   * 포커스를 되돌린다. 편집 진입 시 그 버튼이 DOM 에서 사라지므로,
   * 복귀 렌더가 커밋된 뒤(effect) 새로 붙은 버튼을 찾아 focus 한다.
   */
  useEffect(() => {
    const prev = prevEditingKey.current;
    const next = editingKey ?? null;
    prevEditingKey.current = next;
    if (prev !== null && next === null) {
      editButtonRefs.current.get(prev)?.focus();
    }
  }, [editingKey]);

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
                    <div role="group" aria-label={editorLabel ? editorLabel(row) : undefined}>
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
                        onOpenChange={(open) => setOpenKey(open ? key : null)}
                        menu={{ items: menuItems, onClick: onMenuClick }}
                      >
                        <Button
                          type="text"
                          size="small"
                          className="af-icon-btn"
                          aria-haspopup="menu"
                          aria-expanded={openKey === key}
                          aria-label={actionsLabel ? actionsLabel(row) : undefined}
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
                          }}
                          onCancel={() => setConfirmTarget(null)}
                          onOpenChange={(open) => {
                            if (!open) setConfirmTarget(null);
                          }}
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
