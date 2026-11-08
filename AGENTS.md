# PROJECT KNOWLEDGE BASE

**Generated:** 2026-10-17  
**Commit:** a071fc0 
**Branch:** feature/prototype-debt-ui

## OVERVIEW
Assetflow is a planning and execution workspace for Sprint 1, tracking frontend/backend implementation, a static prototype, card statement import samples, and AI-assisted development workflows. The project uses five AI subagent roles (analyst, architect, developer, reviewer, tester) with strict permission boundaries.

## STRUCTURE
```
assetflow/
├── .ai/             # Decision records and session logs
├── .git             # Git repository
├── .github/         # CI/CD and automation workflows
├── .opencode/       # AI subagent configs and pipeline commands
├── apps/            # Frontend and backend implementation workspaces
├── design/          # Static prototype (dashboard, expenses, assets, etc.)
├── samples/         # Card statement Excel samples and column contracts
└── AGENTS.md        # Project knowledge base (this file)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Project overview | README.md | Main project description |
| Decision records | `.ai/project.md` | Canonical numbered decision log |
| Work log | `.ai/session-log.md` | Chronological what was done / what is left |
| Agent configs | `.opencode/agent/` | Default: `lead`, `planner`, `designer`, `developer`, `qa`; optional `architect`; legacy `analyst`, `reviewer`, `tester` |
| Pipeline commands | `.opencode/command/` | `/feature` (lead pipeline), `/review`, `/design` entry points |
| Mobile UI skill | `.opencode/skills/mobile-ui/SKILL.md` | 320/375/390/430px overflow·modal·touch·safe-area checklist |
| Integration runbook | `.opencode/skills/integration-runbook/SKILL.md` | 은행·증권·이메일·암호·API 키·권한·로그인 절차 |
| Automation workflows | `.github/workflows/` | CI/CD and issue automation |
| Card statement samples | `samples/card/` | Excel samples and column contract |
| Design skills | `~/.config/opencode/skills/` | 31 design skills, global (not in this repo). Route with the `design-playbook` skill (§50) |
| Engineering skills | `~/.config/opencode/skills/` | 57 more, global. Route with the `workflow-playbook` skill (§51) |

## CODE MAP
- **Frontend workspace**: `apps/frontend/` – browser-side implementation
- **Backend workspace**: `apps/backend/` – server-side logic and validation
- **Design system**: `design/prototype/` – static prototype (IA map, dashboard, expenses, assets, settings, login)
- **Card statement import**: `samples/card/` – Excel samples, column contract, and parser tools
- **AI roles**: 기본 경로는 `lead` → (`planner`/`designer` 선택) → `developer` → `qa`. `architect`는 계약/DB 변경 시 선택. `analyst`·`reviewer`·`tester`는 legacy 선택 역할.
- **Design skills**: `~/.config/opencode/skills/` – 31 design skills installed globally (not in this repo); the `design-playbook` skill routes a task to the right one (§50)
- **Engineering skills**: `~/.config/opencode/skills/` – 57 engineering, writing, and document skills installed globally; the `workflow-playbook` skill routes those (§51). Both routers are siblings: design work goes to `design-playbook`, everything else to `workflow-playbook`.

## CONVENTIONS
- **Document placement**: A document's path tells you what belongs in it. Records go into existing files rather than new ones (see `.ai/project.md` §32).
- **AI subagents**: `lead`가 사람의 말을 해석·진단하고 태스크 패킷으로 쪼개 전문 에이전트에 위임한다. 코드를 쓰는 역할은 `developer`뿐이고, `qa`는 개발자 설명 없이 AC·산출물만으로 독립 검증한다.
- **Cost tiers**: Lite(`lead`+`developer`, ≤3 calls) / Standard(`+qa`, ≤6) / Full(`+planner`/`designer`, ≤12) / Deep(`+architect`, 병렬 조사, ≤20). `planner`·`designer`·`architect`는 필요할 때만 부른다. QA 재시도는 최대 2회.
- **Human gates**: 기획 승인 → 외부 접근(은행·증권·이메일·키·권한) 확인 → 최종 QA → 배포. 외부 시스템은 `integration-runbook` 스킬을 따른다.
- **Config reload**: `.opencode/`·`opencode.json` 변경은 OpenCode v2가 자동 반영한다(설정 파일 watch). 즉시 반영이 필요하면 `/reload` 또는 `opencode reload`. 서비스가 멈췄을 때만 `opencode service restart`. `opencode -c`는 "마지막 세션 이어서 열기"이며 설정 재로딩과 무관하다.
- **Pipeline commands**: `/feature <requirement>` runs the lead pipeline with cost tiers; `/review <range>` reviews the current diff then verifies it; `/design <scope>` runs the UI lane with `designer` + `qa`.

## ANTI-PATTERNS
- **Never commit a real card statement.** Card numbers, member names, and merchant names are personal financial data. Only anonymized copies under `samples/card/anonymized/` are tracked; `.gitignore` blocks common real-data paths.
- **Encrypted files**: Read only when opened with the exact password the user typed, or when already decrypted. No retry loops, brute forcing, or workaround logic. The file and password never reach the server.
- **Magic bytes over extensions**: Real card statement files may be named `.xlsx` but be ECMA-376 Agile Encryption packages (CFB containers). The tool detects the real format from magic bytes instead of trusting the extension.

## COMMANDS
```bash
# Inspect a card statement sample before writing a parser
node samples/card/tools/inspect.mjs samples/card/anonymized/synthetic-sample.xlsx

# Pipeline commands (via opencode)
/feature <requirement>
/review <range>
/design <screen-or-modal-scope>
```

## NOTES
- 2026-11-07 확인: 이 환경의 `~/.config/opencode/skills`가 비어 있어, 위 표의 전역 디자인/엔지니어링 스킬은 실제로 로드되지 않는다. 모바일 UI 작업은 프로젝트 로컬 `.opencode/skills/mobile-ui`를 우선 사용한다.
- Sprint 1 bootstrap checklist: create GitHub labels, register Issues 1-8, verify issue label automation workflow, start implementation from Issue 1 in order.
- Card statement import parses CSV/plaintext XLSX with SheetJS on the frontend for preview (§60); the server re-validates the normalized rows against the same contract (`samples/card/card-columns.json`). Apache POI re-validation is not implemented yet (§53.1 B2).
- Bank balance refresh (§61) calls the free quick-inquiry API at `api.bankapi.co.kr` from the server. Only `cash`/`deposit` accounts, only NH/KB/WR/IBK, Korean source IP only. `BANK_API_KEY`/`BANK_SECRET_KEY` are required; `BANK_LINK_KEY` (or `JWT_SECRET`) encrypts stored account numbers. Account passwords and birth dates are never stored.

---
*Generated by init-deep on 2026-10-17*