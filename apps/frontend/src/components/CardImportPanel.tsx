import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Select, Space, Table, Typography } from "antd";
import contractJson from "../../../../samples/card/card-columns.json";
import { detectCardCompany, inspectContainer, parserFor } from "../lib/card/detect-card.mjs";
import { getImportedRowKeys, submitCardImports, type CardImportRow, type CardImportResult } from "../api/cardImportApi";
import { formatKrwExact } from "../utils/formatters";

const contract = contractJson as Parameters<typeof detectCardCompany>[1];

type Phase = "idle" | "parsing" | "review" | "submitting" | "done" | "error";

/**
 * 스프린트 2 #22: 카드 내역 가져오기 (§29.7 흐름의 React 이관).
 * - 업로드 → 컨테이너 판별(매직 바이트) → 카드사 판별(계약 시그니처) → 파싱 →
 *   가맹점 단위 미리보기(용도구분 선택) → 확정(서버 재검증·저장).
 * - 암호화 CFB 는 열지 않는다(§29.5.1) — 비밀번호 입력란도 두지 않는다.
 * - 합계는 행에서 재계산. 미분류 가맹점은 어느 합계에도 들어가지 않는다.
 */
export function CardImportPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState("");
  const [errorText, setErrorText] = useState("");
  const [groups, setGroups] = useState<{ merchant: string; count: number; gross: number; rows: CardImportRow[] }[]>([]);
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [dupKeys, setDupKeys] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CardImportResult | null>(null);

  useEffect(() => {
    // 미리보기에서 건너뛸 이미-임포트 행 키
    getImportedRowKeys()
      .then((keys) => setDupKeys(new Set(keys)))
      .catch(() => setDupKeys(new Set()));
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
        setErrorText("아직 xlsx 파일은 지원하지 않습니다. CSV 파일로 올려 주세요.");
        setPhase("error");
        return;
      }

      const text = new TextDecoder("utf-8").decode(bytes);
      const company = detectCardCompany(text, contract);
      const module_ = parserFor(company);
      if (!module_) {
        setErrorText("카드사를 판별할 수 없습니다. 지원 형식은 삼성카드/현대카드 CSV입니다.");
        setPhase("error");
        return;
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
      setKinds(Object.fromEntries(list.map((g) => [g.merchant, ""])));
      setPhase("review");
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "파싱에 실패했습니다.");
      setPhase("error");
    }
  }, []);

  const confirm = useCallback(async () => {
    setPhase("submitting");
    try {
      const all = groups.flatMap((g) => g.rows);
      const rules = Object.fromEntries(Object.entries(kinds).filter(([, v]) => v !== ""));
      const res = await submitCardImports(all, rules);
      setResult(res);
      setPhase("done");
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "반영에 실패했습니다.");
      setPhase("error");
    }
  }, [groups, kinds]);

  const classified = groups.filter((g) => kinds[g.merchant]);
  const totalGross = classified.reduce((acc, g) => acc + g.gross, 0);
  const skipped = groups.reduce((acc, g) => acc + g.rows.filter((r) => dupKeys.has(r.rowKey)).length, 0);

  /** 반영 완료 후 파일 선택으로 복귀 — 방금 반영한 행이 중복으로 잡히도록 키 목록을 다시 읽는다. */
  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setResult(null);
    setGroups([]);
    setKinds({});
    setErrorText("");
    setNotice("");
    getImportedRowKeys()
      .then((keys) => setDupKeys(new Set(keys)))
      .catch(() => setDupKeys(new Set()));
  }, []);

  if (phase === "done" && result) {
    return (
      <Card>
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Alert
            type="success"
            showIcon
            title={`반영 완료 — 새로 저장 ${result.stored}건 / 받은 ${result.received}건 (총 원장 ${result.totalRows}행)`}
            description={`합계(행에서 재계산): 이용금액 ${formatKrwExact(result.totals.gross)} · 부가세 ${formatKrwExact(result.totals.vat)}${result.supplyInconsistentRows > 0 ? ` · 공급가액+세액 불일치 경고 ${result.supplyInconsistentRows}행` : ""}`}
          />
          <Button onClick={resetToIdle}>다른 파일 가져오기</Button>
        </Space>
      </Card>
    );
  }

  return (
    <Card aria-label="카드 내역 가져오기">
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Typography.Text strong>카드 내역 가져오기</Typography.Text>
        {notice ? <Alert type="warning" showIcon title={notice} /> : null}
        {errorText ? <Alert type="error" showIcon title={errorText} /> : null}

        {(phase === "idle" || phase === "error") && (
          <label>
            <input
              data-testid="card-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
              삼성카드/현대카드 CSV (UTF-8) 를 올리면 가맹점별로 확인 후 반영합니다.
              원본 파일은 서버로 올라가지 않습니다.
            </Typography.Text>
          </label>
        )}

        {(phase === "parsing" || phase === "submitting") && (
          <Typography.Text type="secondary">{phase === "parsing" ? "파싱 중…" : "서버 재검증·저장 중…"}</Typography.Text>
        )}

        {phase === "review" && (
          <>
            <Table
              size="small"
              rowKey="merchant"
              dataSource={groups}
              pagination={false}
              columns={[
                { title: "가맹점", dataIndex: "merchant" },
                { title: "건수", dataIndex: "count", width: 80 },
                { title: "이용금액 합계", dataIndex: "gross", width: 160, render: (v: number) => v.toLocaleString("ko-KR") + "원" },
                {
                  title: "용도구분",
                  width: 200,
                  render: (_: unknown, g: { merchant: string }) => (
                    <Select
                      size="small"
                      style={{ width: 180 }}
                      placeholder="미분류"
                      value={kinds[g.merchant] || null}
                      onChange={(v: string) => setKinds((prev) => ({ ...prev, [g.merchant]: v }))}
                      options={[
                        { value: "사업비용", label: "사업비용" },
                        { value: "개인지출", label: "개인지출" },
                        { value: "자산취득", label: "자산취득" },
                      ]}
                    />
                  ),
                },
              ]}
            />
            <Typography.Text type="secondary">
              분류된 가맹점 {classified.length}곳 · 합계 {totalGross.toLocaleString("ko-KR")}원 ·
              미분류 {groups.length - classified.length}곳은 어느 합계에도 들어가지 않습니다 (§29.7)
              {skipped > 0 ? ` · 이미 임포트된 행 ${skipped}건은 서버가 건너뜁니다 (§29.6)` : ""}
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
