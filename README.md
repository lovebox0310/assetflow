# assetflow planning workspace

This repository tracks planning and execution artifacts for Sprint 1.

## Structure

- `apps/frontend/`: frontend implementation workspace
- `apps/backend/`: backend implementation workspace
- `design/prototype/`: static prototype (index IA map, dashboard, expenses, assets, settings, login)
- `samples/card/`: card statement Excel samples and the shared column contract
- `.ai/project.md`: the canonical decision record (numbered sections, latest last)
- `.ai/session-log.md`: chronological work log — what was done and what is left
- `.opencode/agent/`: AI subagents (analyst, architect, developer, reviewer, tester)
- `.opencode/command/`: pipeline entry points — `/feature`, `/review`
- `.github/workflows/`: automation workflows

A document's path tells you what belongs in it. Records go into these files
rather than new ones — see `.ai/project.md` §32 before adding a document.

## AI roles

Five roles run as separate subagents, not as prompt text in one session.
Permissions enforce most of what each role may do: only `developer` can write
files freely, and `reviewer` and `tester` are deliberately denied the developer's
reasoning so the review stays independent. `tester` writes only on approval,
because it needs to create throwaway verification scripts. See
`.ai/project.md` §33 — including what the permissions do *not* enforce.

- `/feature <requirement>` — runs all five in order
- `/review <range>` — reviews the current diff, then verifies it

Both pass the acceptance criteria (AC) to reviewer and tester, but never the
developer's reasoning: what was asked is shared ground truth, why it was done
that way is not.

Restart opencode after changing anything under `.opencode/`; config is read once
at startup.

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
