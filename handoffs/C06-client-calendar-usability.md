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
- Staff controls: a shared provider keeps the header visibility checkbox and review panel synchronized. The checkbox is above the action buttons and tabs, available from Detalles without opening Cliente. Unsaved edits and in-flight/uncertain operations disable conflicting changes; the identical retry remains available even after a focus/refresh event. Design gets neither the client tab nor the checkbox, and does not perform a client publication lookup, including when opening a piece from Calendar. All 41 shared-browser routes passed; the older internal-flow test harnesses now explicitly mock the new read-only header lookup.
- Regression: TypeScript/Vite and Pages/Worker build plus secret scanning passed. Hosted read-only inspection also verified the public client API returns HTTP 200 with the same two calendar pieces and zero requests, and no private fields. Demo checks and deployment completion are recorded below.

No automatic publication, database migration, permission change or external message is needed for these corrections. All new behavioral browser fixtures are fictional; real customer entries are inspected read-only.
