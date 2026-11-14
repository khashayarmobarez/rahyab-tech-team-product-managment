import { config } from "dotenv";

/** Loads .env.local, then .env, the same order Next.js uses. Import this first. */
config({ path: ".env.local", quiet: true });
config({ quiet: true });
