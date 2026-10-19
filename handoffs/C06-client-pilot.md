# Client pilot · 2026-10-19

## Scope

Private revocable links, no client accounts. `/cliente#<token>` opens **Para revisar** and **Calendario**; a request ID after the token opens one exact review. All pending requests remain accessible across calendar months. The calendar has agenda/month views and an undated section; day cells show counts without stretching with the number of pieces.

Staff use **piece → Cliente** to publish or hide a calendar entry, curate a script snapshot, publish the pinned final delivery, inspect responses and withdraw requests. **Clientes → client → Acceso y revisiones del cliente** manages the reusable link and prepares one WhatsApp message with the total pending count. Humans send messages; opening WhatsApp is not tracked as sent. Publishing includes the piece in the client calendar, but never creates a link or sends a message automatically.

Script approval leaves Planning unchanged. Script changes/comments stay with Marketing in the client review panel and activity. Final delivery approval uses the existing workflow; final changes return to Design with source `client` and the original reason. Existing stage-based staff notifications remain in place; no new mail for script comments is introduced. Design still uploads and submits a delivery in exactly the same way.

Multiclient pieces are rejected by the API/projection and have no client tab. No client uploads, client login, PWA installation, automatic WhatsApp or new Drive sharing permissions.

## Boundaries

- New private tables and one server-only RPC; no direct anon/authenticated grants. Staff identity is verified through Supabase Auth and active membership is rechecked inside the RPC. Legacy demo links keep their old scopes.
- 256-bit capability, SHA-256 lookup, AES-GCM encrypted recovery copy bound to workspace/client. Tokens stay in URL fragments, not query strings or paths. Staff can recover, rotate or revoke a link. Anyone possessing it can respond; names are self-reported.
- Allowlisted public metadata/snapshot projection, never the staff workspace, private notes, production script or source videos. The public script editor starts empty; copying the saved text is an explicit staff action followed by editing and publication confirmation.
- Final media reuses pinned Drive revision streaming/Range support. A 15-minute HTTP-only cookie is client-path scoped; every request checks link, publication, archive state and exact latest delivery revision. No Google OAuth tokens, mutable viewer URLs or public Drive sharing reach clients. MOV playback depends on browser support and may require download.
- Workspace lock serializes staff/client actions. Publication checks the expected piece revision; client writes use request IDs and immutable versions. Receipts make retries idempotent; comments do not decide. On uncertain saves, the UI offers the identical operation again and locks conflicting edits.
- Archiving removes calendar publication. Restoring does not republish it. Hiding removes pending requests; renewing/revoking the client link affects the whole client capability.

## Migration and evidence

`202610190001_client_pilot.sql` and `202610190002_client_pilot_media.sql` **applied once successfully to hosted Supabase**. Do not replay them. The second migration qualifies a media lookup alias caught by the real SQL asset authorization test; it preserves the first applied migration and RPC grants. Initial preflight: 46 pieces / 7 clients / 1 Drive connection, no pilot RPC. Hosted rollback probe `supabase/tests/client_pilot_hosted.sql` passed script approval, duplicate response, delivery changes, revocation and grant assertions. Postflight: **46 pieces / 7 clients / 0 pilot links / 0 pilot requests**. No customer content was published and no messages or Drive files were created for that test.

Local verification covers isolated PostgreSQL authorization, client isolation, multiclient exclusion, curated script, version replacement/withdrawal, archive/restore, idempotency and the hosted probe. HTTP doubles cover safe errors, server-generated/encrypted links, invalid capabilities, staff identity, cookies, revocation and streaming a pinned revision after the Drive head changes. Browser doubles cover client/mobile navigation, comments/approval/changes, identical retry after response loss, revocation and staff publication.

The main internal app's complete shared browser suite passed 35 routes; the six final pilot browser cases were rerun after the last changes, including a delayed-read race. The final unit suite covers 564 cases, including pinned media, SQL asset isolation and the hosted rollback probe. Demo browser suite covered 30 routes after an attempted lazy-loading optimization was removed; the affected five were rerun successfully. The final suite/package/deployment results are recorded in PROJECT_STATE.md.

Ignored screenshots: `work/client-pilot-mobile.png`, `work/client-pilot-review.png`, `work/client-pilot-staff.png`. They use fictional data. No real iPhone/Safari client pilot or newly uploaded real client delivery is claimed by these tests.

## Rollout and next check

Start with one willing client. In a single-client piece, prepare the exact public text or final delivery and create its client link. Test the link on a separate phone/browser, including a comment, script approval, final correction and new-version review. Only then send it from WhatsApp. Keep source material and internal notes private. If needed, revoke the link and withdraw/hide the published reviews; internal production continues normally.

Deployments are additive: the previous internal app tolerates the new empty pilot tables. Existing customers receive no access until staff explicitly create a link and publish content. No change to Google OAuth, Resend, DNS or team accounts is required.
