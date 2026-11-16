@AGENTS.md

# Team Reports

Internal site where an IT/software team's daily and weekly reports reach the CEO. Next.js 16 (App Router, Cache Components), TypeScript, Tailwind v4, shadcn/ui, Postgres with Drizzle, zod, Vitest. English only. Users are non-technical managers and a small team, so the language everywhere is plain business English.

Read the docs before changing things: `docs/architecture.md` (how it fits together), `docs/development.md` (recipes, pitfalls), `docs/mcp.md` (agent API), `docs/deployment.md`.

## Commands

```bash
npm run dev            # http://localhost:3000 (one dev server per folder; reuse a running one)
npm run typecheck && npm run lint && npm test && npm run build   # all must pass before you finish
npm run db:generate    # after editing src/server/db/schema.ts; commit the file in drizzle/
npm run db:migrate     # apply migrations (also creates the three people)
npm run seed           # sample data. Overwrites same-day reports: never on real data
docker compose up -d   # local Postgres (needs Docker Desktop running)
```

`.env.local` (gitignored, never commit it) holds `DATABASE_URL`, `SITE_PASSWORD`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and optionally `TEST_DATABASE_URL`. The database tests **empty every table** of `TEST_DATABASE_URL`, so it must be a throwaway database.

## Architecture rules (do not break these)

- **All database access is in `src/server/reports.ts`.** Pages, actions and the MCP server never touch the database directly. Every write there validates with the zod schemas, applies the business rules, and writes an `audit_log` row in the same transaction.
- **Business rules live in `reports.ts`, `src/lib/schemas.ts` or `src/lib/rules.ts`, never in a door** (`src/app/actions.ts`, `src/app/admin/actions.ts`, `src/server/mcp.ts`). The website and agents must not disagree.
- **Validation is shared.** The web forms and the MCP tools use the same schemas in `src/lib/schemas.ts`. Messages are written for the person filling in the form.
- **All date logic is in `src/lib/dates.ts`.** Dates are calendar days in Asia/Tehran (`YYYY-MM-DD`, UTC+3:30, no DST). A week runs Saturday to Thursday; Friday is the day off and belongs to the week that just ended. No `new Date()` or `toLocaleDateString` for calendar days elsewhere.
- `src/lib/` is pure (no database, no `server-only`): client components and the proxy import it.
- Routes are only `/`, `/admin`, `/login` and `/api/*` (`/api/mcp` is for agents, `/api/digest` is for the weekly-email scheduler).

## Product rules

- Saving a daily report for the same person and date **replaces** it. A decision can be answered once. No reports for days or weeks that have not started.
- Weekly summaries: 1 to 5 results, text with no file names or code terms, `numbers` and `waiting_decisions` computed from real data (never typed), due Thursday 23:59 Tehran time.
- **Agents (MCP) save weekly summaries only as drafts and can never change a final one.** `answer_decision` has its own permission (`decisions:answer`). A token that belongs to a person writes only as that person; a team token must name the person.
- The team password is shared, so "Who are you?" in the forms is a trusted-team identity, not security. `/admin` needs a second password.
- Tokens: only the SHA-256 hash is stored; the plain token is shown once.
- **Two kinds of visitor.** `SITE_PASSWORD` = the team. `CEO_PASSWORD` (optional) = the CEO: no report, decision or weekly forms, but can answer decisions (as "ceo"), mark reports seen and leave notes. The role is checked in the server actions (`refuseCeo`, `reviewReportAction`), not just hidden in the UI. The CEO's mark and note live in `report_reviews`, apart from the report, because saving a report replaces it.
- A daily report has an optional `project` name. The page shows what the CEO needs without hunting: topics as small same-size boxes, days that fold, a list view, search across all weeks, "Needs attention" (a blocker repeated on 3+ days, decisions waiting over 2 days), charts, and a print view.

## UI rules

- Text at least 15px (`text-xs`/`text-sm` are mapped to 15px in `globals.css`). Check phone width (375px) for sideways scroll.
- Light and dark follow the system. Keep AA contrast (4.5:1 text, 3:1 borders and focus rings) when touching colours.
- **Green/yellow/red are for report status only**, and the word is always shown too.
- Forms use `useServerForm`, `Field`/`fieldProps` and `ListField` (`src/components/forms/`): field errors under the field, focus on the first invalid one, toast on success, `refresh()` in the action.
- shadcn style is `base-nova` (Base UI). Its `cn` helper comes from the `cn` package, which is intended.

## Next.js 16 specifics (this is not the Next.js you know)

Docs are in `node_modules/next/dist/docs/`. In this project:

- `cacheComponents` is on: request-time data (cookies, database) must sit behind `<Suspense>`; `page.tsx` and `admin/page.tsx` do this. No `use cache` is used; every view reads fresh data.
- Reading the clock while rendering needs a request-time call first (`await connection()`, as in `hasSession`).
- `middleware` is `proxy` (`src/proxy.ts`). Server actions call `refresh()` after writes.
- Drizzle wraps driver errors as `Failed query: ...`; the real reason is in `error.cause` (use `describeError` in `src/lib/db-errors.ts`).

## Testing

Pure tests always run. `src/server/*.integration.test.ts` run only with `TEST_DATABASE_URL` set (and refuse to run if it equals `DATABASE_URL`). When you change behaviour, add or update a test; for an agent tool, add a case to `src/server/mcp.integration.test.ts`, which uses the real MCP client.

## Working notes

- Do not commit unless asked. Never commit `.env*` (only `.env.example`).
- Do not paste passwords or tokens from `.env.local` into chat, code or docs.
- Keep `README.md` short (setup and pointers); put detail in `docs/`.
- When you add a feature that changes how people or agents use the site, update the matching doc in `docs/`.
