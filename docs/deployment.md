# Deployment

The site runs on Vercel with a Neon Postgres database. It also runs on any Node 22+ host with a Postgres database (see the end).

## Deploy to Vercel

1. **Put the code on GitHub** and import the repository in Vercel (Add New → Project). Leave the framework as Next.js and the build settings at their defaults. Vercel uses the `vercel-build` script, which migrates the database and then builds.
2. **Add the database.** In the project, open Storage (or Integrations → Marketplace), choose Neon and connect it to all environments. It sets `DATABASE_URL`, and usually `DATABASE_URL_UNPOOLED` as well. `DATABASE_URL` should be the pooled string (the host contains `-pooler`).
3. **Add the secrets** in Settings → Environment Variables, for Production (and Preview if you use previews):

   | Name | Value |
   | --- | --- |
   | `SITE_PASSWORD` | The shared team password. |
   | `ADMIN_PASSWORD` | A different password for `/admin`. |
   | `SESSION_SECRET` | At least 32 random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |

   Do not reuse your local `.env.local` values.
4. **Set Node.js 22.x** under Settings → Build and Deployment → Node.js Version.
5. **Deploy.** The build log should show "Database is up to date." and then the Next.js build.

The first deploy creates the tables and the three people (Khashayar, Mahan, Hossein). You do not need to run the seed, and you probably do not want sample data in production.

### First run

Open the site and sign in with `SITE_PASSWORD`. Open `/admin` (link in the footer) and sign in with `ADMIN_PASSWORD` to rename people and create API tokens for agents. Share the address and team password with the team.

## How migrations run

`npm run vercel-build` is `npm run db:migrate && next build`.

- `scripts/migrate.ts` applies every SQL file in `drizzle/` that has not run yet, then makes sure the three people exist. It is safe to run again.
- If `DATABASE_URL_UNPOOLED` is set, migrations use it (a direct connection suits schema changes). The website keeps using `DATABASE_URL`.
- Migrations only move forward. To undo a schema change, write a new migration.
- Preview deployments run migrations too. With the default Neon setup, previews share the production database, so a migration on a preview branch changes production data. Turn on Neon's per-preview branching if you want them separate.

## Troubleshooting a failed build

If the build stops at "Migration failed", the log says what it tried and why:

```
Migration failed.
  Tried:  ep-xxxx-pooler.us-east-2.aws.neon.tech:5432/neondb  (from DATABASE_URL)
  Reason: Failed query: ... <- ENOTFOUND: getaddrinfo ENOTFOUND ...
```

| Reason in the log | What it means and how to fix it |
| --- | --- |
| `DATABASE_URL is not set` | The variable is missing for the environment being built. Enable it for Production (and Preview) and redeploy. |
| `Tried: localhost...` | A development address was pasted in. Use the hosted (Neon) connection string. |
| `28P01` / `password authentication failed` | Wrong or rotated password. Copy the connection string again from Neon. |
| `ENOTFOUND` | The host name is wrong or the database was deleted. |
| `ECONNREFUSED` / `ETIMEDOUT` | Nothing answered. Check host and port, and that the database is not paused (free Neon databases can sleep). |

Environment changes apply only to new builds, so redeploy after fixing a variable.

If the site loads but shows "The site cannot reach its database" or "The database is empty", the same variable is wrong at runtime, or the migration did not run. Check `DATABASE_URL` and redeploy.

## Routine operations

| Task | How |
| --- | --- |
| Ship a code change | Push to GitHub. Vercel redeploys and migrates first. |
| Change the database | Edit `src/server/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`, push. |
| Rotate `SESSION_SECRET` | Change it in Vercel and redeploy. Everyone has to sign in again. |
| Change a password | Change `SITE_PASSWORD` or `ADMIN_PASSWORD` and redeploy. Existing sessions stay valid until they expire (30 days team, 8 hours admin); rotate `SESSION_SECRET` to end them now. |
| Switch an agent off | `/admin` → revoke its token. It stops working at once. |
| Custom domain | Settings → Domains. Nothing in the app depends on the domain name. |

## Other hosts

```bash
npm ci
npm run db:migrate   # with DATABASE_URL (and the other variables) set
npm run build
npm start            # listens on port 3000; put it behind HTTPS
```

Needs Node 22+, Postgres, and the variables `DATABASE_URL`, `SITE_PASSWORD`, `ADMIN_PASSWORD`, `SESSION_SECRET`. Login cookies are marked `secure` in production, so the site must be served over HTTPS. If several server instances run, the agent rate limits are counted per instance.
