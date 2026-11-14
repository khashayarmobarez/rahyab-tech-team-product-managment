import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { PERSON_SLUGS } from "@/lib/constants";
import { getDb } from "./db";
import { people } from "./db/schema";

const DEFAULT_NAMES = { khashayar: "Khashayar", mahan: "Mahan", hossein: "Hossein" } as const;

/** Makes sure the three people exist, so a new deployment works before anything is seeded. */
export async function ensurePeople(): Promise<void> {
  const db = getDb();
  for (const slug of PERSON_SLUGS) {
    await db
      .insert(people)
      .values({ slug, name: DEFAULT_NAMES[slug], active: true })
      .onConflictDoNothing({ target: people.slug });
  }
}

/**
 * Applies every SQL file in /drizzle that has not run yet, then makes sure the
 * three people exist. Safe to run again.
 */
export async function runMigrations(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  await ensurePeople();
}
