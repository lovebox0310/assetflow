import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Empty, Modal, Typography } from "antd";
import type { AssetRow, AssetType, DashboardData } from "../data/dashboardMock";
import { updateSettings, type UserSettings } from "../api/settingsApi";
import { ASSET_TYPE_LABELS, assetComposition } from "../dashboard/metrics";
import { AssetCompositionList } from "../dashboard/AssetCompositionList";
import { formatKrwExact } from "../utils/formatters";

interface CompositionBasisModalProps {
  open: boolean;
  /** 저장된 설정. 아직 로드되지 않았으면 null — 저장을 막는다. */
  settings: UserSettings | null;
  /** 대시보드 summary(자산 목록). null 이면 아직 로딩 중 — 저장을 막는다. */
  data: DashboardData | null;
  onClose: () => void;
  onSaved: (settings: UserSettings) => void;
}

/** 유형 그룹 순서 — 구성비 슬라이스와 같은 순서(§23). */
const TYPE_ORDER: AssetType[] = ["cash", "deposit", "invest", "realty"];

/**
 * §89 자산 구성비 "전액 현금성" 계좌 지정 모달.
 *
 * 사용자가 계좌별로 체크하면 그 계좌는 유형과 무관하게 현금성으로 계산하고,
 * 체크하지 않은 계좌는 §88 규칙(증권 예수금만 현금성, 투자는 보유종목 평가액)을 따른다.
 * 저장은 PUT /api/v1/settings 에 `compositionCashAccountIds` **한 필드만** 보낸다 —
 * 다른 설정(비상금 등)을 건드리지 않는다.
 *
 * cash 유형은 이미 현금성이므로 항상 체크·비활성으로 보여 주고 payload 에서 제외한다.
 * 비상금(emergencyAccountIds)과는 완전히 별개다.
 */
export function CompositionBasisModal({
  open,
  settings,
  data,
  onClose,
  onSaved,
}: CompositionBasisModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  const assets = useMemo<AssetRow[]>(() => data?.assets ?? [], [data]);
  // 설정을 못 읽었거나 자산 목록이 없으면 기존 값을 덮어쓸 수 있으므로 저장을 막는다.
  const canSave = settings !== null && data !== null;

  useEffect(() => {
    if (!open) return;
    setSelected(settings?.compositionCashAccountIds ?? []);
    setErrorText("");
    setSaving(false);
  }, [open, settings]);

  /** 저장·미리보기에 쓰는 목록 — cash 행은 항상 현금성이므로 제외하고,
   * 지금 목록에 없는 id(삭제된 계좌)도 보내지 않는다. */
  const selectedNonCash = useMemo(() => {
    const typeById = new Map(assets.map((asset) => [asset.id, asset.type]));
    return selected.filter((id) => {
      const type = typeById.get(id);
      return type !== undefined && type !== "cash";
    });
  }, [selected, assets]);

  const groups = useMemo(
    () =>
      TYPE_ORDER.map((type) => ({
        type,
        rows: assets.filter((asset) => asset.type === type),
      })).filter((group) => group.rows.length > 0),
    [assets],
  );

  const preview = useMemo(
    () => (data ? assetComposition(data, { cashAccountIds: selectedNonCash }) : []),
    [data, selectedNonCash],
  );

  // 실패 안내는 body 상단에 있다 — 스크롤이 아래에 있어도 보이게 올린다.
  useEffect(() => {
    if (!errorText) return;
    const scroller = topRef.current?.closest(".ant-modal-body");
    if (scroller instanceof HTMLElement) scroller.scrollTop = 0;
  }, [errorText]);

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const without = prev.filter((value) => value !== id);
      return checked ? [...without, id] : without;
    });
  };

  const save = async () => {
    setSaving(true);
    setErrorText("");
    try {
      const updated = await updateSettings({ compositionCashAccountIds: selectedNonCash });
      onSaved(updated);
      onClose();
    } catch (e: unknown) {
      setErrorText(e instanceof Error ? e.message : "설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="자산 구성비 기준 설정"
      onCancel={onClose}
      centered
      destroyOnHidden
      width="min(640px, calc(100vw - 24px))"
      styles={{
        container: {
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        },
        body: {
          overflowY: "auto",
          flex: "1 1 auto",
          minHeight: 0,
          padding: "0 16px 12px",
          overscrollBehavior: "contain",
        },
        footer: {
          margin: 0,
          flex: "0 0 auto",
          padding: "12px 16px calc(12px + var(--af-safe-bottom))",
          borderTop: "1px solid var(--af-border)",
        },
      }}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button type="primary" loading={saving} disabled={!canSave} onClick={() => void save()}>
            저장
          </Button>
        </div>
      }
    >
      <div ref={topRef}>
        {errorText ? (
          <Alert
            type="error"
            showIcon
            title="설정을 저장하지 못했습니다"
            description={errorText}
            style={{ marginBottom: 16 }}
            aria-live="assertive"
          />
        ) : null}

        {settings === null || data === null ? (
          <Alert
            type="warning"
            showIcon
            title="설정을 아직 불러오지 못했습니다"
            description="기존 기준을 덮어쓰지 않도록 저장을 막았습니다. 대시보드를 새로고침한 뒤 다시 시도해 주세요."
            style={{ marginBottom: 16 }}
            aria-live="polite"
          />
        ) : null}

        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          체크한 계좌는 전액 현금성으로 계산하고, 체크하지 않은 계좌는 유형대로 자동
          분류됩니다.
        </Typography.Paragraph>

        {groups.length === 0 ? (
          <Empty description="자산 화면에서 계좌를 추가하면 여기에서 고를 수 있습니다." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {groups.map((group) => (
              <fieldset
                key={group.type}
                style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
              >
                <legend style={{ padding: 0, fontWeight: 600, fontSize: 14 }}>
                  {`${ASSET_TYPE_LABELS[group.type]} (${group.rows.length})`}
                </legend>
                {group.type === "invest" ? (
                  <Typography.Text type="secondary" className="af-comp-group__hint">
                    증권 예수금은 현금성, 보유종목은 투자입니다.
                  </Typography.Text>
                ) : null}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {group.rows.map((asset) => {
                    const isCash = asset.type === "cash";
                    const checked = isCash || selectedNonCash.includes(asset.id);
                    return (
                      <label key={asset.id} className="af-comp-row">
                        <Checkbox
                          checked={checked}
                          disabled={isCash || saving}
                          onChange={(event) => toggle(asset.id, event.target.checked)}
                        />
                        <span className="af-comp-row__body">
                          <span className="af-comp-row__name">{asset.name}</span>
                          <span className="af-comp-row__meta">
                            {ASSET_TYPE_LABELS[asset.type]}
                          </span>
                          {isCash ? (
                            <span className="af-comp-row__badge">항상 현금성</span>
                          ) : null}
                        </span>
                        <span className="af-comp-row__amount af-num">
                          {formatKrwExact(asset.value)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}

        <div role="status" aria-live="polite" style={{ marginTop: 20 }}>
          <Typography.Text style={{ fontWeight: 600 }}>계산 미리보기</Typography.Text>
          <AssetCompositionList slices={preview} />
        </div>
      </div>
    </Modal>
  );
}
