# Upcoming date labels · 2026-10-21

Management Pending and Design cards retain the planned date and add **Vence hoy** / **Vence mañana** beneath it. Today's unfinished tasks use the same red styling as overdue work; tomorrow retains the regular date color. Past dates retain **Fecha vencida**. Approved, scheduled, published, archived and undated work does not gain urgency labels.

Both views use `deadlineNotice` and the existing Argentina date hook. Tomorrow uses calendar-day arithmetic, including month/year boundaries. This is presentation only: no state transitions, sorting changes, Attention category changes, notifications, client publication or database changes.

Verification: 11 existing work-list unit cases and seven Pending/History/Design browser flows passed, including Argentina midnight rollover. Production package TypeScript/Pages Worker and secret scan passed. No new tests or dependencies for this visual change. Hosted verification and deployment are recorded in PROJECT_STATE.md.
