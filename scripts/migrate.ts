import "./env";
import { databaseProblem, describeError, describeTarget, isLocalAddress } from "../src/lib/db-errors";
import { closeDb } from "../src/server/db";
import { runMigrations } from "../src/server/migrate";

/**
 * Migrations should use a direct connection, not a connection pooler. Neon (and
 * the Vercel integration) provide one as DATABASE_URL_UNPOOLED. If it is there,
 * use it for this script only. The website itself keeps using DATABASE_URL.
 */
function chooseMigrationUrl(): { url: string | undefined; note: string } {
  const direct = process.env.DATABASE_URL_UNPOOLED;
  if (direct) {
    process.env.DATABASE_URL = direct;
    return { url: direct, note: "DATABASE_URL_UNPOOLED (direct connection)" };
  }
  return { url: process.env.DATABASE_URL, note: "DATABASE_URL" };
}

function explain(url: string | undefined, error: unknown): string[] {
  const problem = databaseProblem(error);
  const lines: string[] = [];
  if (problem === "not-configured") {
    lines.push(
      "DATABASE_URL is not set where this runs.",
      "On Vercel: Settings > Environment Variables. Add DATABASE_URL (or connect Neon under Storage) and make sure it is enabled for the environment you are deploying (Production or Preview), then redeploy.",
    );
  } else if (/\b(28P01|28000)\b|authentication failed/i.test(describeError(error))) {
    lines.push(
      "The database refused the user name or password in DATABASE_URL.",
      "Copy the connection string again from the database provider (Neon: Dashboard > Connect) into the Vercel environment variable, then redeploy. Passwords that were reset or rotated leave old strings invalid.",
    );
  } else if (isLocalAddress(url)) {
    lines.push(
      "The address points at this computer (localhost). That works on your own machine but not on Vercel.",
      "Set DATABASE_URL on Vercel to your hosted database (for example the Neon connection string), then redeploy.",
    );
  } else if (problem === "unreachable") {
    lines.push(
      "The database did not accept the connection. Check, in the settings of the environment that is building:",
      "  - the host name, user name and password in DATABASE_URL are correct and not out of date;",
      "  - the database name exists;",
      "  - the database is not paused or deleted (Neon free databases can sleep; open the Neon console to wake it).",
    );
  } else if (problem === "not-set-up") {
    lines.push("The database is reachable but a table it needs is missing.");
  }
  return lines;
}

async function main(): Promise<void> {
  const { url, note } = chooseMigrationUrl();
  try {
    await runMigrations();
    console.log("Database is up to date.");
  } catch (error) {
    console.error("Migration failed.");
    console.error(`  Tried:  ${describeTarget(url)}  (from ${note})`);
    console.error(`  Reason: ${describeError(error)}`);
    for (const line of explain(url, error)) console.error(line);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
