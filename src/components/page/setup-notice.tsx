import type { DatabaseProblem } from "@/lib/db-errors";

const COPY: Record<DatabaseProblem, { title: string; body: string; steps: string[] }> = {
  "not-configured": {
    title: "The database address is missing",
    body: "The site does not know which database to use.",
    steps: ["Copy .env.example to .env.local", "Set DATABASE_URL in it", "Restart the server"],
  },
  unreachable: {
    title: "The site cannot reach its database",
    body: "Nothing answered at the address in DATABASE_URL, or the login details were refused.",
    steps: [
      "Start the database. With Docker: docker compose up -d",
      "Check DATABASE_URL in .env.local (host, port, user, password, database name)",
      "Reload this page",
    ],
  },
  "not-set-up": {
    title: "The database is empty",
    body: "The database is reachable, but the tables have not been created yet.",
    steps: [
      "Run: npm run seed (tables, the three people, sample data) or npm run db:migrate (tables only)",
      "Reload this page",
    ],
  },
};

/** Shown instead of a crash when the database is not ready. */
export function SetupNotice({ problem }: { problem: DatabaseProblem }) {
  const copy = COPY[problem];
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="text-muted-foreground">{copy.body}</p>
      <ol className="grid list-decimal gap-2 rounded-xl border bg-card p-5 pl-9 shadow-sm">
        {copy.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="text-muted-foreground">
        This is a setup problem, not something you did. The details are in the server&apos;s terminal.
      </p>
    </main>
  );
}
