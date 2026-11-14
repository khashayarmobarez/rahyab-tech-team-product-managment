# Development guide

Setup is in the [README](../README.md). How the code fits together is in [architecture.md](architecture.md). This page is for making changes.

## Daily loop

```bash
docker compose up -d     # Postgres (Docker Desktop must be running)
npm run dev              # http://localhost:3000
```

Before finishing a change, all of these must pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` runs the database tests too when `TEST_DATABASE_URL` is set in `.env.local`. They empty that database, so it must be a throwaway one:

```bash
docker compose exec db createdb -U postgres team_reports_test
```

## Recipes

### Change the database

1. Edit `src/server/db/schema.ts`.
2. `npm run db:generate` writes a SQL file into `drizzle/`. Read it, then commit it with the code.
3. `npm run db:migrate` applies it locally. Deploys apply it automatically.

Every table keeps `id`, `created_at`, `updated_at`. Do not edit a migration that has already been deployed; add a new one.

### Add or change a field on a report, decision or summary

Follow the data from the bottom up:

1. **Schema** in `src/server/db/schema.ts` (and a migration).
2. **Validation** in `src/lib/schemas.ts`. Messages are written for the person filling in the form.
3. **Service** in `src/server/reports.ts`: save and read the field, and include it in the audit summary if useful.
4. **Form parsing** in `src/lib/form-parsers.ts` and the server action in `src/app/actions.ts`.
5. **The dialog** in `src/components/forms/`. Use `Field`, `fieldProps`, and `ListField` so errors, focus and ARIA work.
6. **The page** in `src/components/page/`.
7. **Agents**: add it to the input of the matching tool in `src/server/mcp.ts` and to the `*ForAgent` mapper that returns it.
8. **Tests** in `schemas.test.ts` and the integration tests, and update [mcp.md](mcp.md) if the tools changed.

### Add an agent tool or permission

See "Changing it" in [mcp.md](mcp.md). In short: new rules go in `reports.ts` or the schemas, never in `mcp.ts`; gate the tool on a permission; add a case to `src/server/mcp.integration.test.ts`.

### Add a business rule

Put it in `reports.ts` (it needs the database) or `src/lib/rules.ts` and `schemas.ts` (it does not), and add a test. Both the website and the agents then follow it.

### Change colours or text size

Tokens are in `src/app/globals.css`. Light and dark values must keep AA contrast (4.5:1 for text, 3:1 for borders and focus rings). Status colours are only for status. Text must stay at least 15px.

## Conventions

- TypeScript strict. No `any` (one allowed spot: loosely typed JSON in the MCP test helper).
- Dates: only through `src/lib/dates.ts`. Never `new Date()` for a calendar day, never `toLocaleDateString`.
- Data: only through `src/server/reports.ts`. Pages and actions never import the database.
- Server-only code stays out of `src/lib/` (that folder is imported by client components and the proxy).
- Plain business language in everything the CEO reads, in button labels, and in error messages. No jargon, no file names.
- Keep comments for why, not what.

## Pitfalls we have hit

- **Drizzle hides the real database error.** It wraps driver errors as `Failed query: ...`. Look at `error.cause`, or use `describeError` from `src/lib/db-errors.ts`.
- **Clock reads during rendering.** With Cache Components, `Date.now()` in a server component fails unless a request-time call came first. `hasSession()` awaits `connection()` for this reason. Do the same before any new clock read.
- **Stale console errors.** The browser pane's console log keeps old errors across reloads. Check the dev server terminal for the current state.
- **Dev server already running.** `next dev` refuses to start a second one for the same folder. Use the existing one; it hot-reloads.
- **`.env.local` changes.** The database pool is created once per process. Restart `npm run dev` after changing `DATABASE_URL`.
- **Never run `npm run seed` on real data.** It overwrites reports for the same person and day.
- **Screenshots after scrolling can come out blank** in the Claude browser pane because of `scroll-behavior: smooth`. Set `document.documentElement.style.scrollBehavior = 'auto'` first, or check the page with JavaScript.
- **Test passwords.** `.env.local` holds local-only passwords generated for development. Never reuse them anywhere real, and never commit that file (it is gitignored).

## Where things are

```
src/
  proxy.ts                  Redirects to /login without a team cookie
  app/
    page.tsx                The single page
    actions.ts              Server actions for the four forms
    admin/                  /admin: people, tokens, audit log, agent guide
    login/                  /login
    api/mcp/route.ts        The agent endpoint
  components/
    page/                   Page sections, header, footer, agent guide
    forms/                  Dialogs and shared form pieces
    ui/                     shadcn/ui components
  lib/                      Pure code: dates, schemas, rules, sessions, agent access, db-errors
  server/
    reports.ts              All data access
    mcp.ts                  The MCP server
    auth.ts, origin.ts      Passwords and sessions, site address
    db/                     Schema and connection
    migrate.ts              Migration runner (also creates the three people)
drizzle/                    SQL migrations
scripts/                    migrate.ts, seed.ts, env.ts
docs/                       This documentation
```
