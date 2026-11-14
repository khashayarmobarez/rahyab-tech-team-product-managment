# Team Reports

A small internal website that shows the IT and software team's reports to the CEO and the team, and lets the team add them through forms.

One page (`/`) with the week's report, what each person did, decisions waiting for an answer, and past weeks. A second page (`/admin`) manages people and API tokens.

**Stack:** Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Postgres with Drizzle ORM · zod · Vitest. English only.

## Quick start

You need Node 22 or newer and a Postgres database.

```bash
npm install
cp .env.example .env.local     # then edit the four values, see below
npm run seed                   # creates the tables, the three people and sample data
npm run dev                    # http://localhost:3000
```

Sign in with the value you set for `SITE_PASSWORD`.

### A local database

Any Postgres works. If you use Docker, the repo includes one:

```bash
docker compose up -d           # Postgres on localhost:5432, database "team_reports"
```

and `.env.example` already points at it.

## Environment variables

Set these in `.env.local` for development and in your host's settings for production.

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. On Neon, use the **pooled** string (the host contains `-pooler`) and keep `?sslmode=require`. |
| `DATABASE_URL_UNPOOLED` | Optional. A direct (non-pooled) connection string. If it is set, `npm run db:migrate` and the Vercel build use it for migrations; the website still uses `DATABASE_URL`. The Neon integration on Vercel sets it for you. |
| `SITE_PASSWORD` | The one shared team password, asked for on `/login`. |
| `ADMIN_PASSWORD` | A second password for `/admin`. Use a different value from `SITE_PASSWORD`. |
| `SESSION_SECRET` | Signs the login cookies. At least 32 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it signs everyone out. |
| `TEST_DATABASE_URL` | Optional. A **throwaway** database for the database tests (see Tests). |

## Seed data

```bash
npm run seed
```

Applies the migrations (which also create the three people), then adds sample data: daily reports for the last two weeks and this week so far, two weekly summaries, and three decisions (two open, one answered). It works relative to today's date in Tehran, and it is safe to run again: it replaces the sample reports instead of duplicating them. Do not run it against a database holding real reports; it overwrites reports for the same person and day.

`npm run db:migrate` applies the migrations on their own.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` / `npm start` | Production build and server. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript, no output. |
| `npm test` | Vitest, once. `npm run test:watch` to keep it running. |
| `npm run db:generate` | After you change `src/server/db/schema.ts`: writes a new SQL migration into `drizzle/`. Commit it. |
| `npm run db:migrate` | Applies pending migrations to `DATABASE_URL`. |
| `npm run seed` | See above. |

## Deploy to Vercel

1. **Database.** In the Vercel project, add a Neon database (Storage → Neon). It sets `DATABASE_URL` for you. Make sure it is the pooled connection string.
2. **Settings.** Under Settings → Environment Variables add `SITE_PASSWORD`, `ADMIN_PASSWORD` and `SESSION_SECRET`.
3. **Deploy.** Push the repo to GitHub and import it in Vercel, or run `npx vercel --prod`.

The `vercel-build` script runs `npm run db:migrate` before `next build`, so every deploy brings the database schema up to date and makes sure the three people exist. The first deployment needs no manual database step. Run `npm run seed` against the production database only if you want the sample data (you probably do not).

### If the Vercel build fails at "Migration failed"

The build log now says what it tried and why it failed:

```
Migration failed.
  Tried:  ep-xxxx-pooler.us-east-2.aws.neon.tech:5432/neondb  (from DATABASE_URL)
  Reason: Failed query: ... <- ENOTFOUND: getaddrinfo ENOTFOUND ...
```

| Reason in the log | What it means and how to fix it |
| --- | --- |
| `DATABASE_URL is not set` | The variable is missing for the environment being built. In Settings → Environment Variables, enable it for Production (and Preview), then redeploy. |
| `Tried: localhost...` | A development address was pasted in. Replace it with the hosted (Neon) connection string. |
| `28P01` / `password authentication failed` | Wrong or rotated password. Copy the connection string again from Neon. |
| `ENOTFOUND` | The host name is wrong or deleted. |
| `ECONNREFUSED` / `ETIMEDOUT` | Nothing answered. Check the host and port, and that the database is not paused. |

After fixing the variable, redeploy so the build picks it up.

## Who can do what

- **Everyone on the team** shares one password (`SITE_PASSWORD`). A valid password gives a signed, httpOnly cookie that lasts 30 days.
- Because the password is shared, every form asks "Who are you?" and remembers the answer in the browser (`localStorage`). This is a deliberate choice for a small, trusted team: anyone with the password can post as anyone. The audit log records who was picked.
- **`/admin`** needs the team password first and then `ADMIN_PASSWORD`. That session lasts 8 hours and only applies to `/admin`. There you can rename people, switch them off, create and revoke API tokens, and see the audit log.
- **API tokens** are for agents (see "Agents (MCP)" below). A token is shown once when created. Only its SHA-256 hash is stored.
- Every write adds an `audit_log` row: who, through the website or a token, what, and when.

## Rules the app enforces

- **Weeks run Saturday to Thursday.** Friday is the day off and belongs to the week that just ended. All dates are Asia/Tehran (UTC+3:30, no daylight saving). This lives in one tested module: `src/lib/dates.ts`.
- **One daily report per person per day.** Saving again for the same person and date replaces it, so reports can be refreshed through the day. You cannot report on a day that has not happened yet.
- **Weekly summaries**: 1 to 5 results, a status (green, yellow or red), and a draft/final tick. No file names or code terms are allowed in the text the CEO reads. The numbers ("days with a report", "decisions raised", "still open") and the "waiting for a decision" list are worked out from the real data when you save, never typed in. It is due Thursday 23:59 Tehran time.
- **A decision can be answered once.**
- Status colours (green, yellow, red) are used only for status. The words are always shown too, never colour alone.

## How the code is organised

```
src/
  proxy.ts               Sends people without a login to /login
  app/
    page.tsx             The single page (server-rendered)
    actions.ts           Server actions for the four forms
    admin/               /admin: people, tokens, audit log
    login/               /login
  components/
    page/                The five sections, header and footer
    forms/               The form dialogs and their shared pieces
    ui/                  shadcn/ui components
  lib/                   Pure code: dates, validation (zod), rules, sessions
  server/
    reports.ts           ALL data access. Typed. Reused by the MCP server later.
    auth.ts              Passwords and sessions (server only)
    db/                  Drizzle schema and connection
drizzle/                 SQL migrations
scripts/                 migrate and seed
```

`src/server/reports.ts` is the only file that talks to the database. Each write there validates its input with the zod schemas in `src/lib/schemas.ts`, applies the rules, and writes the audit row in the same transaction. The web forms and the future MCP server call the same functions, so they follow exactly the same rules.

### Next.js notes

This project uses the Next.js version bundled in `node_modules/next/dist/docs`, which differs from older versions:

- **Cache Components** is on. Anything that depends on the visitor or the database (the whole page content, in our case) streams in behind a `<Suspense>` boundary. The page shell and a loading skeleton are sent immediately.
- `middleware` is now called `proxy` (`src/proxy.ts`).
- Forms call server actions, and the actions call `refresh()` so the page updates without a full reload.

## Tests

```bash
npm test
```

- **Always run:** date rules (around Friday, midnight, New Year, leap day), validation, the pure data rules, and session tokens.
- **Database tests** (`src/server/reports.integration.test.ts`) run only when `TEST_DATABASE_URL` is set. They empty every table of that database first, so point it at a throwaway database, never at real data. They refuse to run if it equals `DATABASE_URL`. They check, among other things, that saving the same person and date replaces the report, that every write adds an audit row, and that tokens store only a hash.

  ```bash
  # one-off, with Docker:
  docker compose exec db createdb -U postgres team_reports_test
  # then add to .env.local:
  TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/team_reports_test
  ```

## Agents (MCP)

AI agents can read and write through an MCP endpoint on the same site: `POST /api/mcp` (Streamable HTTP, no sessions). It calls the same service functions as the website, so the validation, the rules and the audit log are identical. Writes are recorded with the token's owner and the source "mcp".

**Connect an agent**

1. In `/admin`, create a token: choose who it belongs to and tick only the permissions the agent needs. Copy it, because it is shown once.
2. Give the agent the address and the token. The main page has a step-by-step "Connect an agent" guide at the bottom (also linked from the footer), and `/admin` shows the same guide. Both fill in your real address with copy buttons. For Claude Code:

   ```bash
   claude mcp add --transport http team-reports https://YOUR-SITE/api/mcp --header "Authorization: Bearer YOUR_TOKEN"
   ```

   Any client that supports MCP over HTTP with custom headers works with the same address and `Authorization: Bearer ...` header.

**Permissions.** An agent only sees the tools its token allows.

| Permission | Tools it unlocks |
| --- | --- |
| `reports:read` | `get_week_overview`, `get_daily_reports`, `get_decisions`, `get_weekly_reports`, and the prompt `draft_weekly_summary` (with `weekly:write`) |
| `reports:write` | `save_daily_report` |
| `decisions:write` | `raise_decision` |
| `decisions:answer` | `answer_decision` (normally the CEO's call, so it is its own permission) |
| `weekly:write` | `save_weekly_report` |

`whoami` is always available: it returns today's date and week (Tehran), the team, and the writing rules.

**Rules for agents**

- A token that belongs to a person can only write as that person. A team token must name the person on every write.
- **Weekly summaries from agents are always drafts.** A person marks them final on the website, and an agent can never change a summary that is already final.
- Saving a daily report for a person and date that already has one replaces it, exactly as on the website.
- Rate limits: 120 requests a minute per token, and 20 failed attempts a minute per caller address. These are counted in memory by each server instance, so on Vercel they slow a runaway agent but are not a hard global limit.
- Wrong or revoked tokens get `401`. Cookies are never accepted on this endpoint.

**Try it without an agent**

```bash
curl -s -X POST https://YOUR-SITE/api/mcp -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Not built yet

- A management-friendly view: a "needs attention" strip, a one-page digest, and a read-only login for the CEO.
- Login attempt limits on the website. There is a short delay after a wrong password, but no lockout. Fine behind a shared password on a small team; add rate limiting if the site is exposed more widely.
