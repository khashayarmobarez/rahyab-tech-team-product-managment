# Team Reports

A small internal website that shows the IT and software team's reports to the CEO and the team, and lets the team (and AI agents) add them.

One page (`/`) shows the week's report, what each person did, decisions waiting for an answer, and past weeks. Forms add daily reports, decisions and the weekly summary. `/admin` manages people and API tokens.

**Stack:** Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Postgres with Drizzle ORM · zod · Vitest. English only.

## Documentation

| Read this | For |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | How it is built: layers, data model, date and business rules, sessions, forms, design rules |
| [docs/mcp.md](docs/mcp.md) | Connecting AI agents: the MCP endpoint, permissions, every tool |
| [docs/deployment.md](docs/deployment.md) | Deploying to Vercel, migrations, fixing a failed build, other hosts |
| [docs/development.md](docs/development.md) | Making changes: recipes, conventions, pitfalls |
| [CLAUDE.md](CLAUDE.md) | Short rules for AI coding assistants working in this repo |

## Quick start

You need Node 22 or newer and a Postgres database.

```bash
npm install
cp .env.example .env.local     # then edit the values, see below
npm run seed                   # creates the tables, the three people and sample data
npm run dev                    # http://localhost:3000
```

Sign in with the value you set for `SITE_PASSWORD`.

Any Postgres works. The repo includes one for Docker (Docker Desktop must be running); `.env.example` already points at it:

```bash
docker compose up -d           # Postgres on localhost:5432, database "team_reports"
```

## Environment variables

Set these in `.env.local` for development and in your host's settings for production.

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. On Neon, use the **pooled** string (the host contains `-pooler`) and keep `?sslmode=require`. |
| `DATABASE_URL_UNPOOLED` | Optional. A direct (non-pooled) connection string. If set, migrations use it; the website still uses `DATABASE_URL`. The Neon integration on Vercel sets it for you. |
| `SITE_PASSWORD` | The one shared team password, asked for on `/login`. |
| `ADMIN_PASSWORD` | A second password for `/admin`. Use a different value from `SITE_PASSWORD`. |
| `SESSION_SECRET` | Signs the login cookies. At least 32 random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it signs everyone out. |
| `TEST_DATABASE_URL` | Optional. A **throwaway** database for the database tests. They empty it first, so never point it at real data. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` / `npm start` | Production build and server. |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript. |
| `npm test` | Vitest, once (`npm run test:watch` to keep it running). Database tests run only if `TEST_DATABASE_URL` is set. |
| `npm run db:generate` | After you change `src/server/db/schema.ts`: writes a SQL migration into `drizzle/`. Commit it. |
| `npm run db:migrate` | Applies pending migrations to the database. Also creates the three people. |
| `npm run seed` | Migrates, then adds sample data (two weeks of reports, two weekly summaries, three decisions). Safe to repeat, but it overwrites reports for the same person and day, so **do not run it on real data**. |

## Who can do what

- **The team** shares one password. Because it is shared, each form asks "Who are you?" and remembers the answer in the browser. That is a deliberate choice for a small trusted team: anyone with the password can post as anyone.
- **`/admin`** needs the team password and then `ADMIN_PASSWORD`. There you rename people, switch them off, create and revoke API tokens, and read the audit log.
- **Agents** connect over MCP with a token from `/admin`, and only see the tools its permissions allow. See [docs/mcp.md](docs/mcp.md).
- Every change is recorded in an audit log: who, through the website or a token, what, and when.

## Rules the app enforces

- Weeks run **Saturday to Thursday**; Friday is the day off. All dates are Asia/Tehran.
- One daily report per person per day. Saving again **replaces** it. No reports for days that have not happened.
- Weekly summaries are plain business language (no file names or code), have 1 to 5 results and a status, and their numbers are computed from real data. AI agents can only save them as drafts.
- A decision can be answered once.

Details and reasons are in [docs/architecture.md](docs/architecture.md).

## Deploying

Vercel with a Neon database; the build migrates the database first. Steps and troubleshooting are in [docs/deployment.md](docs/deployment.md).

## Not built yet

- A management-friendly view: a "needs attention" strip, a one-page digest, and a read-only login for the CEO.
- Login attempt limits on the website (there is a short delay after a wrong password, but no lockout).
