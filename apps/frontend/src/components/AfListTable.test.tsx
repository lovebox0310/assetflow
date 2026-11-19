import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AfListTable } from "./AfListTable";
import type { AfListColumn, AfRowAction } from "./AfListTable";

/**
 * #33: 행 `⋯` 오버레이(Dropdown·Popconfirm)가 닫힐 때 포커스가 그 행 `⋯` 로
 * 돌아오는지, 닫힌 표에서 오버레이가 새지 않는지 확인한다.
 *
 * Popconfirm 은 트리거가 1×1 앵커(포커스 불가)라 닫히면 포커스가 body 로
 * 흘러간다 — 컴포넌트가 직접 복귀시킨다. 그리고 "항목 선택으로 다른 UI 가
 * 열리는" 경우에는 복귀시키지 않는다(그 UI 가 포커스를 관리한다).
 */

interface Row {
  id: number;
  name: string;
}

const rows: Row[] = [
  { id: 1, name: "하나" },
  { id: 2, name: "둘" },
];

const columns: AfListColumn<Row>[] = [
  { key: "name", header: "이름", mobile: "primary", render: (r) => r.name },
];

afterEach(cleanup);

function deleteActions(onSelect: () => void) {
  return (row: Row): AfRowAction[] => [
    {
      key: "delete",
      label: "삭제",
      danger: true,
      confirm: `${row.name} 삭제할까요?`,
      onSelect,
    },
  ];
}

/** 메뉴를 열고 확인이 필요한 항목을 눌러 Popconfirm 을 띄운다. */
async function openConfirm(triggerName: string) {
  fireEvent.click(screen.getByRole("button", { name: triggerName }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "삭제" }));
  // Popconfirm 은 포털에 렌더된다 — 확인 버튼이 뜨면 열린 것이다.
  return screen.findByRole("button", { name: /^(OK|확인)$/ });
}

describe("AfListTable 행 오버레이 포커스", () => {
  it("Popconfirm 확인 후 그 행 ⋯ 로 포커스가 돌아온다", async () => {
    const onSelect = vi.fn();
    render(
      <AfListTable
        labelledBy="h-test"
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        actions={deleteActions(onSelect)}
        actionsLabel={(r) => `${r.name} 행 메뉴`}
      />,
    );

    const trigger = screen.getByRole("button", { name: "둘 행 메뉴" });
    const ok = await openConfirm("둘 행 메뉴");
    fireEvent.click(ok);

    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Popconfirm 취소 후 그 행 ⋯ 로 포커스가 돌아온다", async () => {
    const onSelect = vi.fn();
    render(
      <AfListTable
        labelledBy="h-test"
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        actions={deleteActions(onSelect)}
        actionsLabel={(r) => `${r.name} 행 메뉴`}
      />,
    );

    const trigger = screen.getByRole("button", { name: "둘 행 메뉴" });
    await openConfirm("둘 행 메뉴");
    fireEvent.click(await screen.findByRole("button", { name: /^(Cancel|취소)$/ }));

    expect(onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("항목 선택이 다른 UI 를 여는 경우에는 포커스를 ⋯ 로 뺏지 않는다", async () => {
    /** onSelect 시점의 포커스 — 메뉴 항목이어야 하고 트리거면 안 된다. */
    let activeDuringSelect: Element | null = null;

    function Harness() {
      const fieldRef = useRef<HTMLInputElement>(null);
      return (
        <>
          <AfListTable
            labelledBy="h-test"
            rows={rows}
            rowKey={(r) => r.id}
            columns={columns}
            actions={() => [
              {
                key: "edit",
                label: "편집",
                onSelect: () => {
                  activeDuringSelect = document.activeElement;
                  // 실제 화면에서는 편집 행/모달이 열리며 그쪽이 포커스를 갖는다.
                  fieldRef.current?.focus();
                },
              },
            ]}
            actionsLabel={(r) => `${r.name} 행 메뉴`}
          />
          <input ref={fieldRef} aria-label="편집 대상" />
        </>
      );
    }

    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "둘 행 메뉴" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "편집" }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("편집 대상")));
    // 선택 직후 트리거로 포커스를 옮겼다면 방금 연 UI 의 포커스를 덮었을 것이다.
    expect(activeDuringSelect).not.toBe(trigger);
  });

  it("actions 가 없으면 ⋯ 메뉴·확인 앵커를 렌더하지 않는다", () => {
    render(<AfListTable labelledBy="h-test" rows={rows} rowKey={(r) => r.id} columns={columns} />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector('[aria-haspopup="menu"]')).toBeNull();
    // Popconfirm 앵커(1×1 span)도 없다.
    expect(document.querySelector(".af-list__cell--actions")).toBeNull();
  });

  it("disabled 항목은 선택되지 않고 확인 팝업도 열리지 않는다", async () => {
    const onSelect = vi.fn();
    render(
      <AfListTable
        labelledBy="h-test"
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        actions={(row) => [
          { key: "stop", label: "중지", danger: true, disabled: true, confirm: `${row.name} 중지할까요?`, onSelect },
        ]}
        actionsLabel={(r) => `${r.name} 행 메뉴`}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "둘 행 메뉴" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "중지" }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^(OK|확인)$/ })).toBeNull();
  });

  it("Popconfirm 앵커(1×1)는 포커스 대상이 아니다", () => {
    render(
      <AfListTable
        labelledBy="h-test"
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        actions={deleteActions(() => {})}
        actionsLabel={(r) => `${r.name} 행 메뉴`}
      />,
    );

    const anchors = document.querySelectorAll(".af-list__cell--actions > span");
    expect(anchors.length).toBe(rows.length);
    anchors.forEach((anchor) => {
      expect(anchor.getAttribute("tabindex")).toBeNull();
      expect((anchor as HTMLElement).tabIndex).toBe(-1);
    });
  });
});

/**
 * #34 C-10: 편집 행을 열면 포커스가 편집 셀 **안** 으로 가야 첫 Esc 가 편집 종료로
 * 이어진다. 종전에는 편집을 연 행 탭 버튼이 DOM 에서 사라지며 포커스가 body 로
 * 흘러가, Esc 1회 + Tab 1회가 필요했다.
 */
function EditHarness({ editor }: { editor?: (row: Row) => ReactNode }) {
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <AfListTable
      labelledBy="h-test"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      onActivate={(r) => setEditing(r.id)}
      activateLabel={(r) => `${r.name} 분류 편집`}
      editingKey={editing}
      editorLabel={(r) => `${r.name} 편집 중`}
      renderEditor={editor ?? ((r) => <input aria-label={`${r.name} 이름 입력`} />)}
      onCancelEdit={() => setEditing(null)}
    />
  );
}

describe("AfListTable 편집 행 포커스 (#34 C-10)", () => {
  it("편집 진입 시 편집 셀의 첫 포커서블로 포커스가 간다", async () => {
    render(<EditHarness />);

    fireEvent.click(screen.getByRole("button", { name: "둘 분류 편집" }));

    const input = await screen.findByLabelText("둘 이름 입력");
    await waitFor(() => expect(document.activeElement).toBe(input));
    // 편집 셀 안이어야 행의 Esc 캡처 핸들러가 그 키를 받는다.
    expect(document.activeElement?.closest(".af-list__cell--editor")).not.toBeNull();
  });

  it("Esc 한 번으로 편집이 끝나고 포커스가 그 행 버튼으로 돌아온다", async () => {
    render(<EditHarness />);

    fireEvent.click(screen.getByRole("button", { name: "둘 분류 편집" }));
    const input = await screen.findByLabelText("둘 이름 입력");
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => expect(screen.queryByLabelText("둘 이름 입력")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "둘 분류 편집" })),
    );
  });

  it("포커서블이 없는 편집 내용이면 편집 컨테이너(role=group)가 포커스를 받는다", async () => {
    render(<EditHarness editor={() => <span>읽기 전용</span>} />);

    fireEvent.click(screen.getByRole("button", { name: "둘 분류 편집" }));

    await waitFor(() => {
      const active = document.activeElement as HTMLElement | null;
      expect(active?.getAttribute("role")).toBe("group");
      expect(active?.getAttribute("aria-label")).toBe("둘 편집 중");
      expect(active?.tabIndex).toBe(-1);
      expect(active?.closest(".af-list__cell--editor")).not.toBeNull();
    });

    // 컨테이너로 받아도 Esc 1회 종료는 같다.
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "둘 분류 편집" })),
    );
  });
});
