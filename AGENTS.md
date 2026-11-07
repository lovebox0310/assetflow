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
| Agent configs | `.opencode/agent/` | Analyst, architect, developer, reviewer, tester + mobile design lane (`ux-auditor`, `design-architect`, `mobile-ui-developer`, `visual-reviewer`) |
| Pipeline commands | `.opencode/command/` | `/feature`, `/review`, `/design` entry points |
| Mobile UI skill | `.opencode/skills/mobile-ui/SKILL.md` | 320/375/390/430px overflow·modal·touch·safe-area checklist |
| Automation workflows | `.github/workflows/` | CI/CD and issue automation |
| Card statement samples | `samples/card/` | Excel samples and column contract |
| Design skills | `~/.config/opencode/skills/` | 31 design skills, global (not in this repo). Route with the `design-playbook` skill (§50) |
| Engineering skills | `~/.config/opencode/skills/` | 57 more, global. Route with the `workflow-playbook` skill (§51) |

## CODE MAP
- **Frontend workspace**: `apps/frontend/` – browser-side implementation
- **Backend workspace**: `apps/backend/` – server-side logic and validation
- **Design system**: `design/prototype/` – static prototype (IA map, dashboard, expenses, assets, settings, login)
- **Card statement import**: `samples/card/` – Excel samples, column contract, and parser tools
- **AI roles**: Five separate subagents in `.opencode/agent/`, each with distinct permissions
- **Design skills**: `~/.config/opencode/skills/` – 31 design skills installed globally (not in this repo); the `design-playbook` skill routes a task to the right one (§50)
- **Engineering skills**: `~/.config/opencode/skills/` – 57 engineering, writing, and document skills installed globally; the `workflow-playbook` skill routes those (§51). Both routers are siblings: design work goes to `design-playbook`, everything else to `workflow-playbook`.

## CONVENTIONS
- **Document placement**: A document's path tells you what belongs in it. Records go into existing files rather than new ones (see `.ai/project.md` §32).
- **AI subagents**: Five roles run as separate subagents, not as prompt text in one session. Permissions enforce most of what each role may do: only `developer` can write files freely; `reviewer` and `tester` are deliberately denied the developer's reasoning.
- **Mobile design lane**: UI changes run `ux-auditor` → `design-architect` → `mobile-ui-developer` → `visual-reviewer`. The visual reviewer sees only AC, scope, and before/after screenshots — not the developer's rationale. Verify at 320/375/390/430px.
- **Restart opencode** after changing anything under `.opencode/` – config is read once at startup.
- **Pipeline commands**: `/feature <requirement>` runs all five roles in order; `/review <range>` reviews the current diff then verifies it; `/design <scope>` runs the mobile design lane.

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