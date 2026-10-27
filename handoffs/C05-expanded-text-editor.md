# Expanded text editor · 2026-10-27

## Behavior

The internal `/text/:pieceId` page still opens in reading mode for Design. **Editar** opens wide text fields for the script/slides and caption, or one story content field. Fields grow with the text; the sticky toolbar keeps **Guardar cambios** available. Ctrl/Cmd+S uses the same save action. Successful saves stay in editing mode; Volver a lectura/Cancelar returns to the reader. Existing internal notes and legacy story instructions remain read-only.

Only changed script/caption fields are sent through the existing `update-piece` command with the baseline revision. This never publishes to the client automatically or changes the task stage. Caption locks match the normal Details form (published content, or a delivery in review/approved/scheduled). Concurrent edits retain the local draft and block overwrite until explicit reload/discard. Polling updates clean editors normally. Dirty drafts survive a remote archive for copying, but cannot save.

Unsaved work prompts on tab close/reload and on Panel navigation; Cancel and loading the latest revision also confirm before discarding. This is an in-memory draft, not automatic local persistence. Uncertain submitted saves use the existing session retry journal: fields freeze, the exact operation can be retried after reload, and only confirmation clears it. Staff authentication and sign-out/revocation behavior remain provided by the existing StaffAccess boundary.

## Verification

- 17 shared browser cases passed: five new editor cases plus existing workspace/session/retry/concurrency regression. Includes long content, sticky controls, 390 px width, exact field patch, exact UUID replay after reload, concurrent preservation, caption lock, one story field, discard/close prompts and remote archive.
- Three demo text-view cases passed, including an added assertion that a save from the wide editor reaches the original piece dialog in another tab.
- TypeScript, safe shared Pages build, Worker compilation and private-key package scan passed. Service tests use mocked services; no real piece was edited or published for these checks. No database migration or notification Worker change required.

Deployment identifier, exact bundle match and read-only hosted editor inspection are recorded in PROJECT_STATE.md. Next use: open a piece → Abrir texto completo → Editar; save with the button or Ctrl+S. Actual client sharing remains the explicit Actualizar vista del cliente action.
