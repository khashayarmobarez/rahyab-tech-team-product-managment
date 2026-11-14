import "./env";
import { closeDb } from "../src/server/db";
import { runMigrations } from "../src/server/migrate";

async function main(): Promise<void> {
  try {
    await runMigrations();
    console.log("Database is up to date.");
  } catch (error) {
    console.error("Migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
