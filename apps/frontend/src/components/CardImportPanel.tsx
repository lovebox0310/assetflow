import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import { Alert, Button, Card, Select, Space, Table, Tag, Typography } from "antd";
import contractJson from "../../../../samples/card/card-columns.json";
import { detectCardCompany, inspectContainer, parserFor } from "../lib/card/detect-card.mjs";
import { sheetCsvCandidates } from "../lib/card/card-xlsx.mjs";
import {
  getImportedRowKeys,
  getMerchantRules,
  submitCardImports,
  type CardImportRow,
  type CardImportResult,
  type MerchantRule,
} from "../api/cardImportApi";
import { CATEGORY_GROUP_OPTIONS, isUnclassified, subCategoryOptions } from "../data/expenseCategories";
import { formatKrwExact } from "../utils/formatters";
import { useMinWidth } from "../hooks/useMinWidth";

const contract = contractJson as Parameters<typeof detectCardCompany>[1];

type Phase = "idle" | "parsing" | "review" | "submitting" | "done" | "error";

/**
 * #34 C-03: 검토 표 분류 Select 의 접근 이름. 가맹점이 비어 있으면 열 이름만
 * 쓴다(빈 문자열로 시작하는 이름 "  대분류" 를 만들지 않는다).
 * 지출 화면의 기존 문구(`${merchant} 세부 분류`)와 같은 패턴을 쓴다.
 */
export function categoryAriaName(merchant: string, kind: "대분류" | "세부 분류"): string {
  const label = merchant?.trim() ?? "";
  return label ? `${label} ${kind}` : kind;
}

/**
 * #34 C-01: 좁은 화면의 열 폭 합(가맹점 112 + 70 + 130 + 120 + 110 + 150 + 150).
 * `scroll.x` 에 이 숫자를 주면 antd 가 `table-layout: fixed` 로 바꿔 열 폭을 지킨다.
 */
const NARROW_TABLE_WIDTH = 112 + 70 + 130 + 120 + 110 + 150 + 150;

/**
 * 스프린트 2 #22: 카드 내역 가져오기 (§29.7 흐름의 React 이관).
 * - 업로드 → 컨테이너 판별(매직 바이트) → 카드사 판별(계약 시그니처) → 파싱 →
 *   가맹점 단위 미리보기(대분류·세부 선택·자동 분류 제안) → 확정(서버 재검증·저장).
 * - 암호화 CFB 는 열지 않는다(§29.5.1) — 비밀번호 입력란도 두지 않는다.
 * - 합계는 행에서 재계산. 미분류 가맹점은 어느 합계에도 들어가지 않는다.
 */
export function CardImportPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState("");
  const [errorText, setErrorText] = useState("");
  const [groups, setGroups] = useState<{ merchant: string; count: number; gross: number; rows: CardImportRow[] }[]>([]);
  const [rules, setRules] = useState<Record<string, MerchantRule>>({});
  const [dupKeys, setDupKeys] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CardImportResult | null>(null);
  /** D-02: 시각 컨트롤은 Button, 실제 input 은 화면 밖(sr-only)에 둔다. */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * #34 C-01: 768 이상은 현행(가맹점 열 폭 자동)을 유지하고, 그 미만에서만
   * 폭을 112 로 고정한다. `matchMedia` 구독은 `useMinWidth` 가 이미 한다
   * (새 패키지·반응형 훅 추가 없음). jsdom 처럼 matchMedia 가 없으면 false
   * (= 좁은 화면) — 좁은 화면 쪽이 넘침이 없는 안전한 쪽이다.
   */
  const wideLayout = useMinWidth(768);

  /**
   * #34 AC-6: 클릭·탭으로 들어온 포커스는 보정하지 않는다. 사용자가 이미 보고
   * 누른 지점이라 스크롤을 만들면 화면이 튀고, 열리는 드롭다운의 기준점도 어긋난다.
   * `:focus-visible` 로는 구분할 수 없다 — antd Select 의 입력은 `input[type=text]`
   * 이고 브라우저는 텍스트 입력을 마우스 클릭에도 :focus-visible 로 본다(실측: 클릭·Tab
   * 모두 true). 그래서 표 안 pointerdown 시각을 기록해 그 직후(≤700ms) 포커스만 건너뛴다.
   * (Tab·프로그램 포커스는 pointerdown 이 없으므로 그대로 보정된다.)
   */
  const pointerFocusAt = useRef(0);

  const markPointerFocus = useCallback(() => {
    pointerFocusAt.current = Date.now();
  }, []);

  /**
   * #34 C-02: 검토 표 안 컨트롤의 포커스가 가려지지 않게 두 축을 보정한다.
   * - 가로: 왼쪽 고정 열(가맹점)이 덮으면 스크롤 상자를 그만큼 되돌린다.
   * - 세로: 하단 탭바(고정)가 덮으면 문서를 그만큼 올린다(탭바는 실제 높이를 읽는다).
   * 데스크톱(고정 열 폭·탭바 없음)에서는 조건이 성립하지 않아 아무 일도 하지 않는다.
   */
  const keepControlVisible = useCallback((e: FocusEvent<HTMLElement>) => {
    // 방금 포인터로 눌린 포커스면 손대지 않는다(AC-6). 한 번만 소비한다.
    if (Date.now() - pointerFocusAt.current < 700) {
      pointerFocusAt.current = 0;
      return;
    }
    const target = e.target as HTMLElement;
    const control = target.closest<HTMLElement>(".ant-select") ?? target;
    const scroller = control.closest<HTMLElement>(".ant-table-content, .ant-table-body");
    if (!scroller) return;
    const fix = () => {
      if (!control.isConnected) return;
      const sticky = scroller.querySelector<HTMLElement>("thead th")?.getBoundingClientRect().width ?? 0;
      const box = scroller.getBoundingClientRect();
      const rect = control.getBoundingClientRect();
      /*
       * 가로: 고정 열(왼쪽)이 덮으면 그만큼 되돌리고, 오른쪽으로 넘치면 당긴다.
       * 여유(margin)를 두지 않는다 — 가시 창(142px)과 컨트롤(140px)의 차가 2px 뿐이라
       * 여유를 더 주면 컨트롤 오른쪽이 스크롤 상자를 넘어 브라우저가 다시 되돌린다
       * (실측: +8px 여유 → 포커스마다 112/106 왕복).
       */
      if (rect.left < box.left + sticky) {
        scroller.scrollLeft -= box.left + sticky - rect.left;
      } else if (rect.right > box.right) {
        scroller.scrollLeft += rect.right - box.right;
      }
      // 세로: 하단 탭바(고정)가 덮으면 그만큼 올린다(탭바는 실제 높이를 읽는다). 8px 여유.
      const tabbar = document.querySelector<HTMLElement>(".af-tabbar");
      const inset = tabbar?.getBoundingClientRect().height ?? 0;
      const below = control.getBoundingClientRect().bottom - (window.innerHeight - inset);
      if (below > 0) window.scrollBy(0, below + 8);
    };
    fix();
    /*
     * Chrome 은 포커스 이벤트 뒤에 자기 스크롤을 수행한다(실측: 우리 보정 직후
     * relLeft 120 → 다음 태스크에서 106 으로 되돌아감). 같은 프레임의 rAF 는
     * 그보다 먼저 돌 수 있어, 두 프레임에 걸쳐 한 번 더 맞춘다(fix 는 멱등).
     */
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        fix();
        requestAnimationFrame(fix);
      });
    }
  }, []);

  useEffect(() => {
    // 미리보기에서 걸러뛸 이미-임포트 행 키
    getImportedRowKeys()
      .then((keys) => setDupKeys(new Set(keys)))
      .catch(() => setDupKeys(new Set()));
  }, []);

  /**
   * 명세 텍스트(CSV 또는 xlsx 시트를 CSV 로 바꾼 것)를 판별·파싱해 검토 단계로 넘긴다.
   * 카드사 판별은 계약의 headerSignature 가 한다(§29.7).
   */
  const ingestText = useCallback(async (text: string) => {
    const company = detectCardCompany(text, contract);
    const module_ = parserFor(company);
    if (!module_) {
      throw new Error("카드사를 판별할 수 없습니다. 지원 형식은 삼성카드/현대카드 CSV·XLSX입니다.");
    }
    const parserMod = await import(`../lib/card/${module_.replace(/\.mjs$/, "")}.mjs`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parse = (parserMod as any)[company === "samsungcard" ? "parseSamsungCardStatement" : "parseHyundaiCardStatement"];
    const parsed = parse(text, contract);

    // 가맹점 단위 그룹(§29.7)
    const map = new Map<string, { count: number; gross: number; rows: CardImportRow[] }>();
    for (const r of parsed.rows) {
      const g = map.get(r.merchantName) ?? { count: 0, gross: 0, rows: [] };
      g.count++;
      g.gross += r.grossAmount;
      g.rows.push(r as CardImportRow);
      map.set(r.merchantName, g);
    }
    const list = [...map.entries()].map(([merchant, v]) => ({ merchant, ...v }));
    setGroups(list);
    const merchants = list.map((g) => g.merchant);
    // §55.8.9: 가맹점 대표 업종(첫 비어 있지 않은 값)을 자동 분류 3순위 힌트로 보낸다.
    const businessCategories = Object.fromEntries(
      list
        .map((g) => [
          g.merchant,
          g.rows.find((r) => r.businessCategory?.trim())?.businessCategory?.trim() ?? "",
        ] as const)
        .filter(([, businessCategory]) => businessCategory !== ""),
    );
    const initialRules: Record<string, MerchantRule> = Object.fromEntries(
      merchants.map((m) => [m, { category: "", subCategory: "" }]),
    );
    // §67: 사업자번호는 가맹점명보다 안정적인 키 — 서버가 키워드보다 먼저 본다.
    const businessNos = Object.fromEntries(
      list
        .map((g) => [
          g.merchant,
          g.rows.find((r) => r.businessNo?.replace(/\D/g, ""))?.businessNo?.replace(/\D/g, "") ?? "",
        ] as const)
        .filter(([, businessNo]) => businessNo !== ""),
    );
    try {
      const fetched = await getMerchantRules(merchants, businessCategories, businessNos);
      for (const m of merchants) {
        if (fetched[m]) {
          initialRules[m] = fetched[m];
        }
      }
    } catch {
      // 규칙 조회 실패 시 미분류 상태로 진행 — 반영은 가능해야 한다.
    }
    setRules(initialRules);
    setPhase("review");
  }, []);

  const onFile = useCallback(async (file: File) => {
    setPhase("parsing");
    setErrorText("");
    setNotice("");
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const container = inspectContainer(bytes);
      if (container === "cfb") {
        // §29.5.1 정책: 암호화 패키지는 열지 않는다 — 비밀번호 입력란도 없다.
        setNotice("암호화된 카드사 파일(OLE2)은 열 수 없습니다. 카드사에서 암호화 없는 CSV로 받거나, 엑셀에서 다시 저장한 뒤 올려 주세요.");
        setPhase("idle");
        return;
      }
      if (container === "zip") {
        // 평문 xlsx — 시트를 CSV 로 바꿔 CSV 와 같은 파서·검증 경로를 탄다.
        const candidates = await sheetCsvCandidates(bytes);
        const chosen = candidates.find((c) => detectCardCompany(c.csv, contract));
        if (!chosen) {
          setErrorText("XLSX 에서 카드사 명세 표를 찾지 못했습니다. 삼성카드/현대카드 명세인지 확인해 주세요.");
          setPhase("error");
          return;
        }
        await ingestText(chosen.csv);
        return;
      }

      const text = new TextDecoder("utf-8").decode(bytes);
      await ingestText(text);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "파싱에 실패했습니다.");
      setPhase("error");
    }
  }, [ingestText]);

  const setCategory = useCallback((merchant: string, category: string) => {
    setRules((prev) => {
      const rule = prev[merchant] ?? { category: "", subCategory: "" };
      const subOptions = subCategoryOptions(category).map((o) => o.value);
      const subCategory = subOptions.includes(rule.subCategory) ? rule.subCategory : "";
      return { ...prev, [merchant]: { category, subCategory } };
    });
  }, []);

  const setSubCategory = useCallback((merchant: string, subCategory: string) => {
    setRules((prev) => {
      const rule = prev[merchant] ?? { category: "", subCategory: "" };
      return { ...prev, [merchant]: { ...rule, subCategory } };
    });
  }, []);

  const confirm = useCallback(async () => {
    setPhase("submitting");
    try {
      const all = groups.flatMap((g) => g.rows);
      const rulesToSave = Object.fromEntries(
        Object.entries(rules).filter(([, r]) => !isUnclassified(r.category)),
      );
      const res = await submitCardImports(all, rulesToSave);
      setResult(res);
      setPhase("done");
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "반영에 실패했습니다.");
      setPhase("error");
    }
  }, [groups, rules]);

  const classified = groups.filter((g) => !isUnclassified(rules[g.merchant]?.category));
  const totalGross = classified.reduce((acc, g) => acc + g.gross, 0);
  const skipped = groups.reduce((acc, g) => acc + g.rows.filter((r) => dupKeys.has(r.rowKey)).length, 0);

  /** 반영 완료 후 파일 선택으로 복귀 — 방금 반영한 행이 중복으로 잡히도록 키 목록을 다시 읽는다. */
  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setResult(null);
    setGroups([]);
    setRules({});
    setErrorText("");
    setNotice("");
    getImportedRowKeys()
      .then((keys) => setDupKeys(new Set(keys)))
      .catch(() => setDupKeys(new Set()));
  }, []);

  if (phase === "done" && result) {
    /*
     * #44 / §113 (감사 C-16): 서버는 정리 결과를 함께 내려준다.
     * - `reconciled` > 0: 업로드 기간에서 지운 이메일/미상 잔재 행 수 — 성공 알림 끝에 덧붙인다.
     * - `reconcileSkipped` > 0: 부분 업로드라 자동 정리를 건너뛴 카드사 그룹 수 — 경고로 알린다.
     * 필드가 없으면(구서버·이메일 수집 경로) 0 으로 본다 — 0 이면 아무 알림도 늘리지 않는다.
     */
    const reconciled = result.reconciled ?? 0;
    const reconcileSkipped = result.reconcileSkipped ?? 0;
    return (
      <Card>
        {/*
         * live region 은 이 하나뿐이다(#44 / D-03 과 같은 규칙). antd Alert 는 스스로
         * role="alert" 를 붙이므로 그대로 두면 같은 결과를 두 번 낭독한다 —
         * 안쪽 Alert 의 role 만 지우고(presentation) 바깥에서 한 번만 polite 로 읽는다.
         * '다른 파일 가져오기' 버튼은 region 밖에 둔다(낭독 대상이 아니다).
         */}
        <div role="status" aria-live="polite">
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Alert
              type="success"
              showIcon
              role="presentation"
              title={`반영 완료 — 새로 저장 ${result.stored}건 / 받은 ${result.received}건 (총 원장 ${result.totalRows}행)${reconciled > 0 ? ` · 정리 ${reconciled}건` : ""}`}
              description={`합계(행에서 재계산): 이용금액 ${formatKrwExact(result.totals.gross)} · 부가세 ${formatKrwExact(result.totals.vat)}${result.supplyInconsistentRows > 0 ? ` · 공급가액+세액 불일치 경고 ${result.supplyInconsistentRows}행` : ""}`}
            />
            {reconcileSkipped > 0 && (
              <Alert
                type="warning"
                showIcon
                role="presentation"
                title={`${reconcileSkipped}개 카드사 그룹은 기간이 겹쳐 자동 정리를 건너뛰었습니다`}
                description="부분 업로드로 판단했습니다 — 명세서 전체 기간을 올리면 자동 정리가 실행됩니다"
              />
            )}
          </Space>
        </div>
        <Button style={{ marginTop: 12 }} onClick={resetToIdle}>다른 파일 가져오기</Button>
      </Card>
    );
  }

  // 섹션 h2("카드 내역 가져오기")가 이 영역의 제목이다 — 여기서 같은 문구를 또 쓰지 않는다.
  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {notice ? <Alert type="warning" showIcon title={notice} role="status" aria-live="polite" /> : null}
        {errorText ? <Alert type="error" showIcon title={errorText} aria-live="assertive" /> : null}

        {(phase === "idle" || phase === "error") && (
          <div>
            {/*
             * D-02: 실제 파일 입력은 sr-only 로 숨긴다 — 브라우저 기본 컨트롤은
             * 44 히트를 보장하지 못하고, label 로 감싸면 안내 문단까지 접근 이름에
             * 섞인다. 입력은 탭 순서에서 빼고(tabIndex -1) 버튼만 탭으로 도달하게 한다.
             */}
            <input
              ref={fileInputRef}
              data-testid="card-file"
              type="file"
              className="sr-only"
              tabIndex={-1}
              style={{ fontSize: 16 }}
              aria-label="카드 명세서 파일"
              aria-describedby="card-file-hint"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              aria-label="카드 명세서 파일 선택"
              aria-describedby="card-file-hint"
              style={{
                height: "var(--af-control-h-lg)",
                minHeight: 44,
                minWidth: 120,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              카드 명세서 파일
            </Button>
            <Typography.Text id="card-file-hint" type="secondary" style={{ display: "block", marginTop: 4 }}>
              삼성카드/현대카드 CSV(UTF-8) 또는 평문 XLSX 를 올리면 가맹점별로 확인 후 반영합니다.
              암호화된 XLSX 는 열지 않습니다.
              원본 파일은 서버로 올라가지 않습니다.
            </Typography.Text>
          </div>
        )}

        {(phase === "parsing" || phase === "submitting") && (
          <Typography.Text type="secondary">{phase === "parsing" ? "파싱 중…" : "서버 재검증·저장 중…"}</Typography.Text>
        )}

        {phase === "review" && (
          <>
            <Table
              aria-label="가져온 카드 내역 검토"
              size="small"
              rowKey="merchant"
              dataSource={groups}
              pagination={false}
              /*
               * D-01: 열 폭 합(≈649px)이 320 카드 폭보다 넓다. 문서를 넓히지 않고
               * 표 내용만 카드 안에서 가로 스크롤하게 한다(가맹점 열은 왼쪽 고정).
               * #34 C-01: 폭을 지정하려면 table-layout 이 fixed 여야 한다 — antd 는
               * scroll.x 가 숫자일 때만 fixed 로 바꾼다(`max-content` 는 auto 라
               * 열 폭이 내용에 밀린다). 좁은 화면만 열 폭 합(842px)을 숫자로 준다.
               */
              scroll={{ x: wideLayout ? "max-content" : NARROW_TABLE_WIDTH }}
              /*
               * #34 C-02: 포커스가 행으로 들어오면 고정 열(112px)·하단 탭바 뒤에
               * 깔리지 않게 두 축을 직접 보정한다. Chrome 은 포커스 스크롤에
               * scroll-margin 을 적용하지 않고(실측: 5행 y=506 그대로), 컨트롤이
               * 반쯤 보이면 스크롤도 하지 않는다. 좁은 화면 전용 CSS 만으로는
               * 재현 케이스가 남아 이 핸들러를 둔다(표 밖 위젯에는 영향 없음).
               * #34 AC-6: 포인터로 눌러 들어온 포커스는 보정하지 않는다.
               */
              onRow={() => ({ onFocus: keepControlVisible, onPointerDown: markPointerFocus })}
              columns={[
                /*
                 * #34 C-01: 좁은 화면(<768)에서 가맹점 열 폭을 고정한다. 폭을 비우면
                 * 내용 기반(auto)으로 늘어나 고정 열이 가시 창(≈254px)을 통째로 잠식해
                 * 나머지 열이 전부 가려진다(실측 318.9px > 254px). 이름은 말줄임으로
                 * 자르고 전체 이름은 title(hover)·기존 행 접근 이름에 남긴다.
                 * 768 이상은 폭을 지정하지 않은 현행(자동) 레이아웃을 유지한다.
                 */
                {
                  title: "가맹점",
                  dataIndex: "merchant",
                  fixed: "left",
                  ...(wideLayout ? {} : { width: 112, ellipsis: { showTitle: true } }),
                },
                { title: "건수", dataIndex: "count", width: 70 },
                { title: "이용금액 합계", dataIndex: "gross", width: 130, render: (v: number) => formatKrwExact(v) },
                {
                  title: "업종",
                  width: 120,
                  render: (_: unknown, g: { merchant: string; rows: CardImportRow[] }) => {
                    const bc = g.rows.find((r) => r.businessCategory)?.businessCategory;
                    return <Typography.Text type="secondary" style={{ fontSize: 12 }}>{bc || "—"}</Typography.Text>;
                  },
                },
                {
                  title: "구분",
                  width: 110,
                  render: (_: unknown, g: { merchant: string; rows: CardImportRow[] }) => {
                    const counts = new Map<string, number>();
                    for (const r of g.rows) {
                      const rel = r.memberRelation?.trim() || "본인";
                      counts.set(rel, (counts.get(rel) || 0) + 1);
                    }
                    return (
                      <Space size={4}>
                        {[...counts.entries()].map(([rel, c]) => (
                          <Tag
                            key={rel}
                            /* D-08: antd 프리셋 색 대신 의미 토큰 — 본인=중립, 가족=시그널. */
                            style={{
                              fontSize: 12,
                              margin: 0,
                              borderColor: "transparent",
                              ...(rel === "본인"
                                ? { background: "var(--af-slate-soft)", color: "var(--af-slate)" }
                                : { background: "var(--af-badge-signal-bg)", color: "var(--af-badge-signal-fg)" }),
                            }}
                          >
                            {rel} {c}
                          </Tag>
                        ))}
                      </Space>
                    );
                  },
                },
                {
                  title: "대분류",
                  width: 150,
                  render: (_: unknown, g: { merchant: string }) => (
                    <Select
                      size="small"
                      style={{ width: 140 }}
                      placeholder="미분류"
                      value={rules[g.merchant]?.category || null}
                      onChange={(v: string) => setCategory(g.merchant, v)}
                      options={CATEGORY_GROUP_OPTIONS}
                      /* #34 C-03: 분류 Select 2개(대분류/세부)에 접근 이름을 준다 —
                         32/32 개가 이름 없이 axe label 위반(critical)이었다. */
                      aria-label={categoryAriaName(g.merchant, "대분류")}
                    />
                  ),
                },
                {
                  title: "세부 분류",
                  width: 150,
                  render: (_: unknown, g: { merchant: string }) => (
                    <Select
                      size="small"
                      style={{ width: 140 }}
                      placeholder="-"
                      value={rules[g.merchant]?.subCategory || null}
                      onChange={(v: string) => setSubCategory(g.merchant, v)}
                      options={subCategoryOptions(rules[g.merchant]?.category)}
                      disabled={isUnclassified(rules[g.merchant]?.category)}
                      aria-label={categoryAriaName(g.merchant, "세부 분류")}
                    />
                  ),
                },
              ]}
            />
            <Typography.Text type="secondary">
              분류된 가맹점 {classified.length}곳 · 합계 {formatKrwExact(totalGross)} ·
              미분류 {groups.length - classified.length}곳은 어느 합계에도 들어가지 않습니다
              {/* §29.7 미분류 가맹점은 어떤 합계에도 넣지 않는다 */}
              {skipped > 0 ? ` · 이미 임포트된 행 ${skipped}건은 서버가 걸러냅니다` : ""}
              {/* §29.6 이미 임포트된 행은 서버가 중복으로 걸러낸다 */}
            </Typography.Text>
            <Space>
              <Button type="primary" onClick={confirm}>서버에 반영</Button>
            </Space>
          </>
        )}
      </Space>
    </Card>
  );
}
