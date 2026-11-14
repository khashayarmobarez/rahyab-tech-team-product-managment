# Architecture

How Team Reports is put together, and why. For setup see the [README](../README.md); for day-to-day changes see [development.md](development.md).

## What it is

An internal site where the IT and software team's reports reach the CEO and each other. One page (`/`) shows the week; forms add daily reports, decisions and the weekly summary; `/admin` manages people and API tokens; AI agents can do the same things over MCP ([agent API](mcp.md)).

Routes: `/` and `/admin`, plus `/login` and `/api/*` (`/api/mcp` is the only API route). Nothing else.

## Layers

```
Browser forms ──► server actions (src/app/actions.ts) ──┐
                                                        ├──► src/server/reports.ts ──► Postgres
AI agents ──► POST /api/mcp ──► src/server/mcp.ts ──────┘     (validation, rules, audit row)
```

| Layer | Where | Rule |
| --- | --- | --- |
| Pure code | `src/lib/` | No database, no clock, no framework. Fully unit tested. |
| Data access | `src/server/reports.ts` | The **only** file that reads or writes the database. Every write validates with the zod schemas, applies the business rules, and writes an `audit_log` row in the same transaction. |
| Doors | `src/app/actions.ts`, `src/app/admin/actions.ts`, `src/server/mcp.ts` | Authenticate, turn input into the shared schema shape, call `reports.ts`, turn errors into messages. No business rules of their own. |
| Screens | `src/app/**/page.tsx`, `src/components/` | Server components fetch data and render; small client components handle dialogs and forms. |

Because the website and the agents call the same `reports.ts` functions, they can never disagree about a rule.

## Data model

All tables have `id` (uuid), `created_at`, `updated_at`. Defined in `src/server/db/schema.ts`; migrations in `drizzle/`.

| Table | Purpose | Notes |
| --- | --- | --- |
| `people` | The team: `slug` (`khashayar`, `mahan`, `hossein`), `name`, `active` | Created by the migration step, so a fresh deployment works before seeding. |
| `daily_reports` | `person_id`, `report_date`, `title`, `summary`, `done[]`, `blockers[]`, `next[]` | Unique on (person, date). Saving again **replaces** it. |
| `weekly_reports` | `week_start` (unique Saturday), `one_line`, `results[]`, `by_person` (jsonb), `waiting_decisions[]`, `not_finished[]`, `numbers` (jsonb), `label`, `due_at`, `done` | `numbers` and `waiting_decisions` are computed when saving, never typed. `done` means "final". |
| `decisions` | `title`, `description`, `status` (open/answered), `raised_on`, `raised_by`, `answered_on`, `answer` | `raised_by` is a person slug or `team`. Answered at most once. |
| `api_tokens` | `owner` (person or `team`), `name`, `scopes[]`, `hash`, `prefix`, `last_used_at`, `revoked_at` | Only the SHA-256 hash is stored. The plain token is shown once. |
| `audit_log` | `actor`, `source` (`web` / `mcp`), `action`, `entity`, `entity_id`, `summary`, `details` | One row per write. Shown in `/admin`. |

## Date rules

All in `src/lib/dates.ts` (tested in `dates.test.ts`). No other file does date maths.

- Every date is a calendar day in **Asia/Tehran**, written `YYYY-MM-DD`. Tehran is UTC+3:30 with no daylight saving, so a fixed offset is exact and identical on every server.
- A **week runs Saturday to Thursday**. Friday is the day off and belongs to the week that just ended, so a week start is always "the Saturday on or before the date".
- The weekly summary is **due Thursday 23:59 Tehran time**.
- Display text uses fixed month and weekday tables, not `Intl`, so output does not change with the server's ICU version.

## Business rules

| Rule | Enforced in |
| --- | --- |
| No report for a day that has not happened | `saveDailyReport` |
| No weekly summary for a week that has not started | `saveWeeklyReport` |
| Weekly text must be plain language: no file names, paths or code in backticks | `plainLanguage` in `src/lib/schemas.ts`, using `findCodeTerms` in `src/lib/rules.ts` |
| Results are 1 to 5 items; by-person lines default to "No report this week" | `weeklyReportInputSchema` |
| A decision can be answered once (checked inside the update, so two people cannot both win) | `answerDecision` |
| Agents save weekly summaries only as drafts and cannot change a final one | `saveWeeklyReport(..., { draftOnly: true })` |
| A person's token can only write as that person; a team token must name one | `resolveActingPerson` in `src/lib/agent-access.ts` |

Field limits: daily title 120, summary 2000, lists up to 20 lines of 400; decision title 140, description and answer 2000; weekly one-liner 200, results up to 5 of 300, not-finished up to 10 of 300, by-person line 300.

## Which week a decision belongs to

The page can show a past week (`?week=YYYY-MM-DD`). For the current week, "Needs a decision" means open right now. For a past week it means *still open at the end of that week* (raised by then and not answered by then), and "Recently answered" means answered in the 14 days up to then. See `listDecisionsForWeek` and `src/lib/rules.ts`.

## Access and sessions

- **Team password** (`SITE_PASSWORD`) → cookie `tr_site`, httpOnly, lasts 30 days, sent to every page.
- **Admin password** (`ADMIN_PASSWORD`) → cookie `tr_admin`, lasts 8 hours, sent only to `/admin`.
- Cookies are `kind.expiry.signature`, an HMAC-SHA-256 with `SESSION_SECRET` (`src/lib/session.ts`, Web Crypto, so it also runs in the proxy).
- `src/proxy.ts` redirects visitors without a valid team cookie to `/login`. Pages and server actions check again; the proxy is a quick first guard, not the only one. `/api` is excluded because agents use bearer tokens, never cookies.
- The password is shared, so forms ask "Who are you?" and remember it in `localStorage`. That identity is not secure, by design: anyone with the password can post as anyone. The audit log records who was picked.
- A wrong password waits 0.7 seconds before answering. There is no lockout.

## Rendering (Next.js 16 with Cache Components)

This project uses the Next.js bundled in `node_modules/next/dist/docs`; it differs from older versions.

- `cacheComponents` is on. Anything that depends on the visitor or the database sits behind a `<Suspense>` boundary: `page.tsx` and `admin/page.tsx` send a static shell and a skeleton at once and stream the content.
- Nothing is cached (`use cache` is not used). Every view reads fresh data.
- Reading the clock (`Date.now()`) during rendering needs a real request first, so `hasSession` calls `await connection()` before checking expiry.
- `middleware` is now `proxy` (`src/proxy.ts`).
- Server actions end with `refresh()`, which re-renders the current page without a full reload.
- Dev-only warnings about `data-gr-*` or `cz-shortcut-listen` on `<body>` come from browser extensions; the body has `suppressHydrationWarning` for that reason.

## Forms

All four dialogs (daily report, raise decision, answer decision, weekly summary) share one pattern:

1. A client form with controlled inputs and the `useServerForm` hook (`src/components/forms/use-server-form.ts`).
2. The hook calls a server action with `FormData`. The action parses it (`src/lib/form-parsers.ts`), calls `reports.ts`, and returns `{ ok, message }` or `{ ok: false, fieldErrors }`.
3. Field errors appear under the field. The first invalid field gets focus: every input marks itself with `data-fields="name other.name"`, the error keys it owns.
4. Typing in a field clears its error. Success shows a toast, closes the dialog, and the action's `refresh()` updates the page.
5. List fields (`ListField`) drop blank rows when saving, and server errors count only non-blank rows (`done.1` is the second line that has text), so the component maps them back to the rows on screen.
6. The daily and weekly forms look up an existing report when the person, date or week changes and prefill it ("You are editing today's report").

## Design rules

- Plain business language. Text is never smaller than 15px (`text-xs` and `text-sm` are mapped to 15px in `globals.css`).
- Light and dark mode follow the system setting (no toggle). Every text and background pair was checked for AA contrast (4.5:1 text, 3:1 borders and focus rings).
- **Status colours (green, yellow, red) are used only for status**, and the word is always shown too.
- Works at phone width with no sideways scroll. The phone header keeps one "Add" menu so it stays short.
- shadcn/ui, style `base-nova` (built on Base UI). Its `cn` helper comes from the `cn` package. Person and week selects are native `<select>`s on purpose.

## Errors when the database is not ready

`src/lib/db-errors.ts` recognises "not configured", "unreachable" and "not set up". The page and `/admin` then show a plain setup screen (`SetupNotice`) instead of a crash, and `npm run db:migrate` / `npm run seed` print the address they tried and the real cause. Drizzle wraps driver errors as "Failed query", so always look at the `cause`.

## Tests

| File | Covers | Needs a database |
| --- | --- | --- |
| `src/lib/dates.test.ts` | Week rules around Friday, Tehran midnight, New Year, leap day | No |
| `src/lib/schemas.test.ts`, `rules.test.ts` | Validation, plain-language check, week numbers | No |
| `src/lib/session.test.ts` | Signed cookies | No |
| `src/lib/agent-access.test.ts`, `db-errors.test.ts` | Agent permissions, rate limiter, error messages | No |
| `src/server/reports.integration.test.ts` | Replace-on-same-day, audit rows, decisions, weekly numbers, tokens | Yes (`TEST_DATABASE_URL`) |
| `src/server/mcp.integration.test.ts` | The MCP endpoint with the real MCP client | Yes (`TEST_DATABASE_URL`) |

The database tests empty every table of `TEST_DATABASE_URL` and refuse to run if it equals `DATABASE_URL`.

## Known limits

- Login attempts on the website are slowed, not locked out.
- Agent rate limits are counted per server instance, so on Vercel they are not a hard global limit.
- There is no read-only login for the CEO and no management summary view yet.
