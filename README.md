# assetflow planning workspace

This repository tracks planning and execution artifacts for Sprint 1.

## Structure

- `apps/frontend/`: frontend implementation workspace
- `apps/backend/`: backend implementation workspace
- `design/prototype/`: static prototype (dashboard, expenses, settings, login)
- `samples/card/`: card statement Excel samples and the shared column contract
- `.ai/` docs in root: role guides and sprint plans
- `.github/workflows/`: automation workflows

## Card statement import

Card purchases can be imported from card company Excel files. FE previews the
file in the browser (SheetJS) and the server re-validates before storing
(Apache POI). Both sides read the same contract, so the two parsers cannot
drift apart:

- `samples/card/card-columns.json`: the column contract (single source of truth)
- `samples/card/README.md`: how to add a card company, anonymization checklist
- `samples/card/tools/inspect.mjs`: inspect a sample's real headers

Inspect a sample before writing a parser for it:

```
node samples/card/tools/inspect.mjs samples/card/anonymized/synthetic-sample.xlsx
```

**Card statements arrive encrypted, and the extension lies.** A real Samsung Card
file was named `.xlsx` but was an ECMA-376 Agile Encryption package
(password protected), so it is a CFB container and not a
zip at all. The tool detects the real format from magic bytes instead of trusting
the extension, because otherwise the only clue is an unhelpful "not a zip" error.

**Encryption policy (user decision).** Encrypted files are read only when they
open with the exact password the user typed, or when they arrive already
decrypted. Password input is the only allowed mechanism: a wrong password is
reported as a failure, and no retry loops, brute forcing, or workaround logic
may be built. The file and the password never reach the server.

**Never commit a real card statement.** Card numbers, member names and merchant
names are personal financial data. Only anonymized copies under
`samples/card/anonymized/` are tracked, and `.gitignore` blocks the common
real-data paths. See §29 in `.ai/project.md`.

## Sprint 1 bootstrap checklist

1. Create GitHub labels defined in `project.md`.
2. Register Issue 1-8 from templates in `project.md`.
3. Verify issue label automation workflow.
4. Start implementation from Issue 1 in order.
