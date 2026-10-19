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

## Regression and rollout

The complete shared browser run passed **41 tests** after its internal-only harnesses were updated to mock the new read-only header lookup. A separate focused demo regression passed **10 tests** covering internal detail, Design and multiclient behavior. The new lost-response test intentionally clicks the controlled checkbox without assuming a server-confirmed checked state. Local screenshots: `work/client-calendar-mobile-fixed.png`, `work/client-calendar-header-management.png`, `work/client-calendar-header-design.png`. They use fictional records. TypeScript, Pages/Worker compilation and package secret scanning passed.

No real client link was created, renewed or revoked, and no customer publication setting was changed during investigation. The API check used the existing active capability ephemerally and reported only allowlisted piece metadata; credentials were not printed or committed. Hosted deployment result follows.

## Published verification

Published **df32725f.gestor-aramis.pages.dev** to **https://gestor.aramis.agency/**, application revision `fd4135e`. The remote bundle matches the prepared production package and the extended Pages smoke passed. A read-only public API check still returns the same two Ariel calendar entries, zero review requests and no private fields. Hosted UI with the existing staff session shows the checked header control for I.A. Para abogados; switching to Design and opening a shared calendar piece omits both client controls while retaining the delivery/material/history tabs. No real publication was changed. Restored the original Management preference after QA. Screenshots: `work/client-calendar-hosted-management.png` and `work/client-calendar-hosted-design.png`.

Work was committed in chunks on `fix/client-calendar-visibility` and integrated into local main; no GitHub push. Existing client links remain valid. Refresh the team app and client page to load the new frontend; a tab opened while deployment was finishing initially held the prior bundle until reloaded. Physical-device client checks remain for Miguel; responsive rendering and keyboard behavior were tested through browser fixtures.
