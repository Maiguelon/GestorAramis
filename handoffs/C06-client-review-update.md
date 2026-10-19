# Unified client publication and review · 2026-10-19

## Scope and behavior

In Management, **piece → Cliente → Actualizar vista del cliente** replaces the header calendar checkbox and separate script/final publication buttons. It includes the calendar entry and updates one explicit public snapshot. The preview and button sit below the piece tabs. **Ocultar del cliente** remains a separate withdrawal operation for a previously shared piece. Link creation/revocation and manual WhatsApp stay unchanged. Design and multiclient tasks still have no client controls or publication calls.

The latest valid final delivery takes priority, with its pinned assets and immutable caption. Otherwise Planning/Production share the saved script, editable in the publication preview to remove internal instructions, plus the saved caption. Private notes and source material are never projected. Empty content shares calendar metadata only, without an empty approval request. Already approved deliveries can be shared for consultation; they are not reopened. Publishing is deliberate and replaces older script/final requests together. Existing links remain valid; existing content is never republished by the migration or deployment.

The client sees separate **Guion/Entrega** and **Caption** sections when present. Each has Accept / Request changes directly underneath. A changes/comment form appears on demand; a change needs a nonempty reason. Partial acceptance leaves the other part pending. The finished piece is approved through the existing delivery workflow only when all its present parts are accepted. Any final changes close that snapshot and return to Design once, with `Entrega:` or `Caption:` in the reason and source client. Script approval stays in its current Planning/Production stage. Comments never approve. Staff can see each part's progress in the published request list. The back action is now a bordered button with an arrow.

One retry boundary serializes all parts of a review. An uncertain response locks the other decisions and back navigation, suppresses background refresh, and retries exactly the same body/key. Staff publication retains its shared pending boundary and dirty-draft guard. Legacy requests keep their original combined decision semantics until staff explicitly republish with the new button; the old client API remains compatible.

## Migration and real evidence

**202610190003_client_review_parts.sql applied once successfully** in hosted Supabase. Do not replay. Additive private columns and replacement service-only functions preserve existing grants, links, records and approved snapshots. No permissions, OAuth, credentials or Drive files changed.

`supabase/tests/client_review_parts_hosted.sql` passed in hosted PostgreSQL with BEGIN/ROLLBACK: script/content and caption acceptance, partial final approval staying in Review, caption correction reaching Design with its reason, exact pinned asset authorization, revocation and service-only grants. All synthetic records rolled back. Result at the time: **48 pieces / 7 clients / 1 link / 1 request**. The live team is editing concurrently; these totals are an observation, not an invariant. No real client was approved or sent changes, and no external messages/files were created.

## Verification

- Full Vitest: 571 cases passed; the subsequently added hosted-parts rollback probe also passed in its 11-case SQL file (572 distinct cases covered).
- Full shared browser suite: 45 passed. Final UI adjustments reran eight publication/independent-review/Design cases successfully.
- Includes delivery-over-script selection, exact delivery caption vs draft, one unified publish action, reload, exact retry after response loss, no leaked unsubmitted draft, comments vs approval, per-part actions and mobile width.
- TypeScript, production package, Worker and secret scan passed before publication; final deployment evidence is recorded below and in PROJECT_STATE.md.
- Browser media cases verify the protected video element/route and action placement; they use service doubles and do not claim actual video playback on a real client iPhone. Existing pinned-range HTTP coverage remains intact. No new real-customer publication was created for UI QA.

Ignored fictional screenshots: `work/client-review-unified-staff.png`, `work/client-review-script-caption.png`, `work/client-review-caption-mobile.png`.

## Next check

Refresh the app. In an existing piece use **Cliente → Actualizar vista del cliente**, review the preview, then open the same client link. Previously calendar-only entries remain metadata-only until this explicit update. Try a real final delivery and caption on the client's phone. No new account or Google renewal is needed for this change.

## Deployment

Published **7b6c11a1.gestor-aramis.pages.dev**, served at **https://gestor.aramis.agency/**; commit `7924841` (UI `bfe09c8`). Final package/TypeScript/Worker/secret scan and remote smoke passed. Remote bundle `index-CcMN88yy.js` is byte-identical to the prepared package. Read-only check of the real client capability returns HTTP 200, the same two calendar pieces and one request, with no internal fields. Hosted staff UI confirms the latest delivery v2 takes precedence, the single publication button sits below the tabs, and the old header checkbox is gone. No publication action was clicked; the modal was closed after inspection. Screenshot `work/client-review-hosted-controls.png` excludes the private link. Sprint commits were fast-forwarded into local main before deployment; no GitHub push. This does not create or upgrade any real public review automatically.
