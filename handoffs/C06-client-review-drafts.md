# Client review drafts · 2026-10-24

## Delivered

Clients prepare section approvals/corrections/comments locally and use **Enviar revisión** once per piece. Accept is a local mark; Guardar stores a draft. Final Send warns about untouched sections and permits partial submission. Unfinished text must be saved/cancelled first. Comments never approve. Untouched sections remain actionable on the same snapshot after changes to another section. Any changes win the aggregate; all present sections must be accepted to approve the finished delivery.

localStorage persists drafts and uncertain submissions by SHA-256 capability hash + request ID + version, without raw capabilities. Reload retries the exact UUID/body, including after a lost response that closed the review. Polling/navigation are blocked while confirmation is uncertain. New versions, revocation, withdrawal and archiving cannot accept fresh stale answers. Storage failure is reported and prevents sending without a recoverable receipt. Drafts stay in this browser/device; clearing storage removes them.

Script/caption feedback goes to Marketing. Material corrections return to Design with explicit client source and material-only reason. Mixed changes notify both audiences. Caption-only delivery corrections preserve pinned files and use Marketing's production queue; Marketing can update the draft caption and reuse the existing files in a new delivery. Script changes return to Planning; script approval preserves the internal stage.

One staff badge shows Cliente · Revisión pendiente / Aprobado / Cambios pedidos only after explicit publication, with section details on hover. Calendar metadata alone produces none. Design sees the badge only for material corrections, without client publication controls or per-row API calls. Removed the redundant Para producción subtitle under En producción; kept its category filter. Return headings distinguish client/team.

Client feedback uses existing preferences/cadences and one current summary per request/audience. Later acceptance retains earlier unresolved corrections in the digest. Negative event sequences separate feedback from normal stage transitions. Claim/send revalidate currentness; withdrawn, superseded, archived or version-invalid events cannot start a stale email. Frozen payloads, leases, provider retry keys and the 23h uncertainty guard remain intact. Drafts produce no events/mail.

## Database

Applied once to hosted Supabase: **202610240001**, **202610240002**, **202610240003**. Do not replay. First two applied together in a transaction. Existing service-only grants retained; a revoked private helper preserves legacy individual responses and staff/media actions. No existing review was republished/reopened. Legacy combined publications use one content decision in the new UI.

`supabase/tests/client_review_batches_hosted.sql` passed in PGlite and hosted PostgreSQL with BEGIN/ROLLBACK: atomic validation, exact replay, Marketing caption routing, subsequent Design material correction, audience reasons, withdrawal and grants. Hosted result: **0 synthetic pieces / 0 synthetic clients remaining**. No Drive calls or actual test mail. Additional isolated tests cover mixed/partial decisions, comments, stale versions/revocation, privacy, dispatch revalidation and earlier corrections surviving later acceptance.

## Verification

- Full Vitest **583 passed**. After final digest migration, 46 relevant SQL/notification cases passed again.
- Shared browser suite initially 46/47: the sole failure expected the former return heading. Updated that assertion to client source; all 11 affected delivery/publication/review/Design cases then passed. All 47 distinct cases covered. Includes save/reload, one batch, partial warning, exact retry after reload, new-version isolation, comments, aggregate badge and Design filtering. Service mocks do not establish real iPhone playback or real-client acceptance.
- TypeScript, safe Pages shared package, Worker build and private-key scan passed. Production notification configuration comes from the ignored generated package; the standalone sample TOML dry-run remains disabled.
- Read-only hosted public API: both active client spaces returned 200, matching calendars, without internal fields. Staff UI shows badges without duplicate subtitle. Existing client link renders draft controls and one Send action; no real response/publication submitted.

Ignored evidence: `work/client-review-status-hosted.png`, `work/client-review-batches-hosted-probe.png`, `work/client-review-design-feedback.png`, `work/client-review-batch-mobile.png`. Final deployment details in PROJECT_STATE.md.

## Next

Refresh and try a deliberately selected piece on a real client phone: video correction + caption acceptance in one send, then a partial send completed later. No new account, DNS, Drive permissions or OAuth renewal needed. Actual phone behavior and email reception for real client feedback still need usage validation. No GitHub push requested for this sprint.
