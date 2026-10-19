# Client calendar usability · 2026-10-19

## Requested corrections

1. Find why calendar-marked pieces appear absent from the client view.
2. Make Calendario a monthly calendar; keep Para revisar as a list.
3. Hide the client tab and client controls in the Design work view.
4. Put calendar visibility beside the piece's top-level actions, outside the client tab.

## Diagnosis

Read-only hosted RPC inspection found an active Ariel Contreras link with two published calendar entries (2026-09-28 and 2026-10-16), and zero published review requests. They were persisted correctly. The client landing page always opened an empty Para revisar list; the calendar started as an agenda and filtered out other months. Calendar visibility intentionally does not publish a script or approve any content.

## Chunks

- Calendar: default to Calendario when there are no actionable requests; monthly grid with visible titles, fixed day heights and an in-flow selected-day list; direct navigation to other populated months; undated entries visible without expanding a hidden section. If the current month has no entries, start with the nearest future or most recent populated month. Seven focused browser tests and production TypeScript/Vite build passed.
- Staff controls: in progress.
- Deployment, regression checks and hosted read-only verification: pending.

No automatic publication, database migration, permission change or external message is needed for these corrections. All new behavioral browser fixtures are fictional; real customer entries are inspected read-only.
