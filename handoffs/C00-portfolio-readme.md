# C00 — English portfolio README

Date: 2026-10-01. Scope: documentation requested by Miguel while product development is paused.

## Changes

Replaced the obsolete demo-only README with an English introduction to the deployed internal V1. It now explains the operational problem, the marketing/design workflow, monthly plans, source material, versioned deliveries, history and grouped email notifications. Architecture, product decisions, AI-assisted development, demo instructions, connected setup and verification are documented separately.

The deployed login is explicitly restricted to the team. Client-facing features are described as local prototypes awaiting live integration. Historical test counts are dated and linked to their evidence; no new functional test run is claimed. No invented efficiency metrics, public sign-up, social publishing, CI badge or license was added.

Two screenshots in `docs/images/` show the fictional local Management and Design fixtures. They were captured from a separate loopback origin, not the shared application. The original UI and demo banner are preserved; there are no real client records, emails, source videos or private tokens in these screenshots.

## Verification

- Reviewed current package scripts, mode configuration, product state and implementation handoffs against the README claims.
- Checked relative Markdown links and images, section anchors, code fences and documented npm scripts.
- Inspected both screenshots for legibility and fictional data.
- Checked Git whitespace and restricted changes to README, screenshots and continuation documentation.

Documentation only: no application code or service configuration changed, no migration, no deployment and no repeated functional suite. Previous notification verification remains in `C11-email-notifications.md`.

## Next action

Product development stays paused until Miguel requests the next block. The planned next phase remains the live client views; this README update does not implement or enable them. Review README status and dated evidence when that phase is actually integrated.

## Follow-up — V1 milestone and deployment-specific OAuth

Miguel confirms that the team already used the internal product before email notifications and considers that internal V1 complete. README now states that milestone explicitly and treats notifications as a subsequent improvement. Client-facing prototypes still require live integration in the next phase; no client acceptance criteria or hosted verification are marked complete.

The general README no longer describes External/Testing or periodic renewal as a product-wide constraint. It distinguishes staff sign-in through Supabase from Google OAuth configured for each deployment. The current Aramis connection's actual publishing status remains in operational notes. ROADMAP, DECISIONS and PROJECT_STATE record the milestone for continuity.

Existing screenshots are unchanged: their data is fictional, and they still use the pre-existing sample brand logos. A wholly fictional set of logos was discussed as an optional presentation update, not implemented here. Relative links, anchors and Markdown structure verified; documentation-only change, no repeated functional tests or deployment.
