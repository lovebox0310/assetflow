import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
} from "antd";
import type { AssetRow } from "../data/dashboardMock";
import type { MonthlyCategoryTotal } from "../api/cardImportApi";
import { updateSettings, type UserSettings } from "../api/settingsApi";
import { CATEGORY_GROUPS, DEFAULT_EMERGENCY_CATEGORIES } from "../data/expenseCategories";
import { emergencyRunway } from "../dashboard/metrics";
import { formatKrwExact, formatMonths } from "../utils/formatters";

interface EmergencyFundSettingsModalProps {
  open: boolean;
  /** 저장된 설정. 아직 로드되지 않았으면 null — 기본값으로 시작한다. */
  settings: UserSettings | null;
  /** 자산 목록 — 비상금 통장 선택지는 현금성(cash)만. */
  assets: AssetRow[];
  /** source=card 로 조회한 월별 대분류 합계. null 이면 아직 로딩 중. */
  cardTotals: MonthlyCategoryTotal[] | null;
  /** 카드지출 조회가 실패했는가 — 미리보기가 필수지출만 반영했음을 알린다. */
  cardTotalsError?: boolean;
  /** 월 필수지출(고정) — 읽기 전용. */
  essentialExpenses: number;
  onClose: () => void;
  onSaved: (settings: UserSettings) => void;
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cash: "현금",
};

/**
 * §59 비상금 유지 개월 기준 설정 모달.
 * 분자(현금성 비상금 통장들의 잔액 합계)와 분모(필수지출 + 선택 카테고리 카드지출 평균)를
 * 여기서 정한다. 저장은 PUT /api/v1/settings 한 번 — 변경 즉시 대시보드 카드가 다시 계산된다.
 */
export function EmergencyFundSettingsModal({
  open,
  settings,
  assets,
  cardTotals,
  cardTotalsError = false,
  essentialExpenses,
  onClose,
  onSaved,
}: EmergencyFundSettingsModalProps) {
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [avgMonths, setAvgMonths] = useState(3);
  const [categories, setCategories] = useState<string[]>([...DEFAULT_EMERGENCY_CATEGORIES]);
  const [targetMonths, setTargetMonths] = useState(6);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  // 설정을 못 읽은 상태에서 저장하면 서버의 기존 기준을 기본값으로 덮어쓸 수 있다.
  const canSave = settings !== null;

  useEffect(() => {
    if (!open) return;
    setAccountIds(settings?.emergencyAccountIds ?? []);
    setAvgMonths(settings?.emergencyAvgMonths ?? 3);
    setCategories(settings?.emergencyCategories ?? [...DEFAULT_EMERGENCY_CATEGORIES]);
    setTargetMonths(settings?.targetMonths ?? 6);
    setErrorText("");
  }, [open, settings]);

  const accountOptions = useMemo(
    () =>
      assets
        .filter((asset) => asset.type === "cash")
        .map((asset) => ({
          value: asset.id,
          label: `${asset.name} · ${ACCOUNT_TYPE_LABEL[asset.type] ?? asset.type} · ${formatKrwExact(asset.value)}`,
        })),
    [assets],
  );

  const runway = useMemo(
    () =>
      emergencyRunway({
        assets,
        essentialExpenses,
        targetMonths,
        emergencyAccountIds: accountIds,
        selectedCategories: categories,
        avgMonths,
        cardTotals: cardTotals ?? [],
      }),
    [assets, essentialExpenses, targetMonths, accountIds, categories, avgMonths, cardTotals],
  );

  const save = async () => {
    setSaving(true);
    setErrorText("");
    try {
      const updated = await updateSettings({
        targetMonths,
        emergencyAccountIds: accountIds,
        emergencyAvgMonths: avgMonths,
        emergencyCategories: categories,
      });
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
      title="비상금 유지 개월 기준"
      onCancel={onClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>취소</Button>
          <Button type="primary" loading={saving} disabled={!canSave} onClick={() => void save()}>
            저장
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        분자는 선택한 <b>현금성 계좌 잔액의 합계</b>입니다. 예적금과 자동이체·부가세처럼
        용도가 정해진 계좌는 선택하지 마세요. 월 사용액 = 월 필수지출 + 선택한 카테고리
        카드지출의 평균이며, 카드지출 평균은 당월을 뺀 이전 N개월을 먼저 보고 이전 데이터가
        없을 때만 이번 달(진행 중)로 계산합니다.
      </Typography.Paragraph>

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

      {settings === null ? (
        <Alert
          type="warning"
          showIcon
          title="설정을 아직 불러오지 못했습니다"
          description="기존 기준을 덮어쓰지 않도록 저장을 막았습니다. 대시보드를 새로고침한 뒤 다시 시도해 주세요."
          style={{ marginBottom: 16 }}
          aria-live="polite"
        />
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>비상금 통장</span>
          <Select
            aria-label="비상금 통장"
            mode="multiple"
            placeholder="현금성 계좌 선택 (여러 개 가능)"
            options={accountOptions}
            value={accountIds}
            onChange={(value) => setAccountIds(value)}
            allowClear
            onClear={() => setAccountIds([])}
            style={{ maxWidth: 420 }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            선택한 계좌 잔액을 합산합니다. 자동이체·부가세 등 용도가 정해진 계좌는 제외하세요.
          </Typography.Text>
        </label>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>카드지출 평균 개월</span>
            <InputNumber
              aria-label="카드지출 평균 개월"
              min={1}
              max={12}
              value={avgMonths}
              onChange={(value) => setAvgMonths(typeof value === "number" ? value : 3)}
              style={{ width: 120 }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              당월 제외 이전 1~12개월
            </Typography.Text>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>목표 개월</span>
            <InputNumber
              aria-label="비상금 목표 개월"
              min={1}
              max={60}
              value={targetMonths}
              onChange={(value) => setTargetMonths(typeof value === "number" ? value : 6)}
              style={{ width: 120 }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              예측 비상금 = 월 사용액 × 목표 개월
            </Typography.Text>
          </label>
        </div>

        <div>
          <Typography.Text style={{ fontWeight: 600 }}>변동지출 카테고리</Typography.Text>
          <Checkbox.Group
            aria-label="변동지출 카테고리"
            options={CATEGORY_GROUPS.map((name) => ({ label: name, value: name }))}
            value={categories}
            onChange={(values) => setCategories(values as string[])}
            style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 8 }}
          />
        </div>

        <div>
          <Typography.Text style={{ fontWeight: 600 }}>월 필수지출 (고정)</Typography.Text>
          <Typography.Paragraph style={{ margin: "4px 0 0" }}>
            {formatKrwExact(runway.fixedMonthly)}
          </Typography.Paragraph>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            지출 화면의 필수 항목 합계입니다. 이미 필수지출에 포함되어 있어 여기서는 읽기만 합니다.
          </Typography.Text>
        </div>
      </div>

      <Divider style={{ margin: "20px 0 12px" }} />

      <div role="status" aria-live="polite">
        <Typography.Text style={{ fontWeight: 600 }}>계산 미리보기</Typography.Text>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <Typography.Text>
            예측 비상금 <b>{formatKrwExact(runway.predictedFund)}</b>
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            목표 {targetMonths}개월 기준
          </Typography.Text>
          <Typography.Text>
            실제 버틸 수 있는 개월 <b>{formatMonths(runway.runwayMonths)}</b>
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            목표 개월을 바꾸면 예측 비상금만 바뀝니다. 실제 버틸 수 있는 개월은 통장 잔액 ÷
            월 사용액으로 정해집니다.
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            월 사용액 {formatKrwExact(runway.monthlySpend)} = 필수 {formatKrwExact(runway.fixedMonthly)} +
            카드 {formatKrwExact(Math.round(runway.variableMonthly))}
          </Typography.Text>
          {runway.accountCount > 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              선택한 비상금 통장 {runway.accountCount}개 합계 {formatKrwExact(runway.accountBalance)}
            </Typography.Text>
          ) : null}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {runway.usedCurrentMonthFallback
              ? "이전 카드 데이터가 없어 이번 달(진행 중) 기준으로 계산했습니다."
              : `카드 데이터 ${runway.monthsWithCardData}/${avgMonths}개월 집계`}
          </Typography.Text>
          {cardTotals === null ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              카드 데이터를 불러오는 중입니다.
            </Typography.Text>
          ) : null}
          {cardTotalsError ? (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              카드지출 데이터를 불러오지 못해 미리보기에 반영되지 않았습니다. 미리보기는
              필수지출만 반영한 값입니다.
            </Typography.Text>
          ) : null}
          {runway.unclassifiedTotal > 0 ? (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              미분류 카드지출 {formatKrwExact(runway.unclassifiedTotal)}은 평균에서 제외됩니다.
              카드내역에서 분류하면 정확해집니다.
            </Typography.Text>
          ) : null}
          {!runway.accountSelected ? (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              비상금 통장을 지정하면 실제 버틸 수 있는 개월을 계산합니다.
            </Typography.Text>
          ) : null}
          {runway.accountSelected && runway.accountCount === 0 ? (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              지정한 계좌를 찾지 못했습니다. 자산 화면에서 계좌를 확인해 주세요.
            </Typography.Text>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
