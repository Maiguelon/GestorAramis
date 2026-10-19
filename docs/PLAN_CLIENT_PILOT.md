# Client pilot sprint · 2026-10-19

Branch: `feature/client-pilot`. The internal V1 remains the team's working tool.

## Accepted scope

One private, revocable link per client opens pending reviews and a calendar without login. Marketing explicitly publishes calendar entries and review snapshots. Scripts and final deliveries have independent approvals. Script approval never starts production. Final delivery changes use the existing return-to-production flow, with client attribution and a required reason. Multiclient pieces are excluded everywhere. WhatsApp messages are prepared for a person to send; nothing sends automatically.

The link grants access to this pilot's published reviews as well as its calendar; legacy read-only calendar links retain their original scope. Anyone with the link can act as the client. Store its SHA-256 hash for authorization and an encrypted copy for staff to recover/share; rotate or revoke it from the client page. Tokens travel in the URL fragment, outside server access logs. Each published request is a versioned snapshot, never an exposure of private script, notes or source material.

## Commit-sized chunks

1. Plan and contracts: explicit public projections and sprint decisions.
2. Persistence and API: additive private tables/RPC, staff authorization, revocation, publication, exact responses and pinned media. Isolated PostgreSQL and HTTP tests.
3. Client page: pending reviews, agenda/calendar, clear approval/changes/comment actions, mobile layout and stale-link recovery. Mock browser tests.
4. Staff controls: publish/withdraw reviews, curated script, calendar visibility, recover/rotate/revoke link, one WhatsApp message with pending count. Preserve Design's existing workflow.
5. Integration: behavioral browser checks, production build/package, migration/deployment where available, updated handoff with real versus simulated evidence.

## Acceptance checks

- No login, internal notes, source videos, other clients or multiclient pieces in public projections.
- Private script is never published by default; staff reviews the client-facing text explicitly.
- Approval is explicit and applies only to the displayed snapshot; comments alone do not approve.
- Duplicate/retried responses cannot apply twice; old final versions cannot change the current workflow.
- Archiving, withdrawing, revoking or replacing a review stops subsequent writes/media reads.
- Final client changes reach Design with the original reason; script changes stay with Marketing.
- Calendar browsing never hides pending reviews from other months.
- Existing internal flows and notifications remain valid.

No client uploads, client login, automatic WhatsApp or new Drive sharing permissions in this sprint.
