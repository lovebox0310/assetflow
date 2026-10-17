# Apps Knowledge Base

**Generated:** 2026-10-17  
**Scope:** Frontend and backend implementation workspaces

## OVERVIEW
The `apps/` directory contains two implementation workspaces: `frontend/` (browser-side) and `backend/` (server-side logic and validation). These are the primary development targets for Sprint 1.

## STRUCTURE
- **frontend/** – browser-side implementation workspace
- **backend/** – server-side logic and validation workspace

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Frontend code | `apps/frontend/` | SheetJS integration for card statement preview |
| Backend code | `apps/backend/` | Apache POI for server-side re-validation |
| Shared contract | `samples/card/card-columns.json` | Single source of truth for column schema |
| Agent configs | `.opencode/agent/` | Five subagent role definitions |

## CODE MAP
- **Frontend entry**: `apps/frontend/` – handles browser-side rendering and file preview
- **Backend entry**: `apps/backend/` – handles server-side validation and storage
- **Shared contract**: `samples/card/card-columns.json` – both sides read this to avoid parser drift

## CONVENTIONS
- Both frontend and backend must read the same column contract (`samples/card/card-columns.json`) to prevent parser drift.
- Frontend uses SheetJS for browser-side preview; backend uses Apache POI for re-validation.
- Follow the permission boundaries defined in `.opencode/agent/` – only `developer` can write files freely.

## ANTI-PATTERNS
- Do not duplicate column contract logic in both frontend and backend; use the single source of truth.
- Avoid putting server-side validation logic in the frontend workspace.
- Keep frontend and backend code in their respective directories; do not mix concerns.