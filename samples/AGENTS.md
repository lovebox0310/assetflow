# Samples Knowledge Base

**Generated:** 2026-10-17  
**Scope:** Card statement Excel samples and column contracts

## OVERVIEW
The `samples/` directory contains card statement Excel samples and the shared column contract that both frontend and backend parsers read. This ensures the two parsers cannot drift apart.

## STRUCTURE
- **card/** – Card statement samples and tools:
  - `card-columns.json` – the column contract (single source of truth)
  - `README.md` – how to add a card company, anonymization checklist
  - `tools/inspect.mjs` – inspect a sample's real headers
  - `anonymized/` – anonymized sample files (tracked)
  - Real card statement files are **never** committed

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Column contract | `samples/card/card-columns.json` | Single source of truth for column schema |
| Sample inspection | `samples/card/tools/inspect.mjs` | Inspect real headers of a sample |
| Anonymized samples | `samples/card/anonymized/` | Only anonymized copies are tracked |
| Setup instructions | `samples/card/README.md` | How to add a card company |

## CODE MAP
- **Column contract**: `samples/card/card-columns.json` – both frontend (SheetJS) and backend (Apache POI) read this
- **Inspector tool**: `samples/card/tools/inspect.mjs` – detects real format from magic bytes, not file extension
- **Anonymized samples**: `samples/card/anonymized/` – synthetic data for testing

## CONVENTIONS
- **Single source of truth**: Both frontend and backend must read `samples/card/card-columns.json` to prevent parser drift
- **Magic bytes over extensions**: Real card statement files may be named `.xlsx` but be ECMA-376 Agile Encryption packages (CFB containers). The tool detects the real format from magic bytes.
- **Encrypted files**: Read only when opened with the exact password the user typed, or when already decrypted. No retry loops, brute forcing, or workaround logic. The file and password never reach the server.
- **Never commit a real card statement**: Card numbers, member names, and merchant names are personal financial data. Only anonymized copies are tracked.

## ANTI-PATTERNS
- Do not duplicate the column contract; always reference `samples/card/card-columns.json`
- Never commit real card statement files – only anonymized copies under `samples/card/anonymized/`
- Do not build retry loops or brute forcing for encrypted files
- Do not trust file extensions; always check magic bytes for format detection