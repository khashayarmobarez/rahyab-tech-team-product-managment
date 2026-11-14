import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentGuide } from "@/components/page/agent-guide";
import { SetupNotice } from "@/components/page/setup-notice";
import { PERSON_SLUGS } from "@/lib/constants";
import { databaseProblem } from "@/lib/db-errors";
import { formatTehranDateTime } from "@/lib/dates";
import { hasAdminAccess, requireSiteSession } from "@/server/auth";
import { siteOrigin } from "@/server/origin";
import { listApiTokens, listAuditLog, listPeople } from "@/server/reports";
import { adminLogoutAction } from "./actions";
import { AdminLoginForm } from "./admin-login-form";
import { PeopleAdmin } from "./people-admin";
import { TokensAdmin } from "./tokens-admin";

export const metadata: Metadata = { title: "Admin · Team Reports" };

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-64 w-full max-w-3xl animate-pulse rounded-2xl bg-muted m-4" role="status" aria-label="Loading admin" />}>
      <AdminContent />
    </Suspense>
  );
}

async function AdminContent() {
  await requireSiteSession();
  if (!(await hasAdminAccess())) return <AdminSignIn />;

  let data;
  try {
    data = await Promise.all([listPeople(), listApiTokens(), listAuditLog(40)]);
  } catch (error) {
    const problem = databaseProblem(error);
    if (!problem) throw error;
    console.error(`Database problem (${problem}):`, error);
    return <SetupNotice problem={problem} />;
  }
  const [people, tokens, audit] = data;
  const owners = [
    { value: "team", label: "The whole team" },
    ...PERSON_SLUGS.map((slug) => ({ value: slug, label: people.find((p) => p.slug === slug)?.name ?? slug })),
  ];

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <BackLink />
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        </div>
        <form action={adminLogoutAction}>
          <Button type="submit" variant="outline">
            Sign out of admin
          </Button>
        </form>
      </div>

      <section aria-labelledby="people-title" className="grid gap-3">
        <h2 id="people-title" className="text-2xl font-semibold tracking-tight">
          People
        </h2>
        <p className="text-muted-foreground">
          Change a name or switch someone off. People who are switched off no longer appear in the forms.
        </p>
        <PeopleAdmin people={people} />
      </section>

      <section aria-labelledby="tokens-title" className="grid gap-3">
        <h2 id="tokens-title" className="text-2xl font-semibold tracking-tight">
          API tokens
        </h2>
        <p className="text-muted-foreground">
          Tokens let a tool, such as an AI assistant, add reports on someone&apos;s behalf. Each token is shown once when you
          create it. You can switch it off at any time.
        </p>
        <TokensAdmin tokens={tokens} owners={owners} />
        <div className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Connect an agent</h3>
          <AgentGuide origin={await siteOrigin()} audience="admin" />
        </div>
      </section>

      <section aria-labelledby="audit-title" className="grid gap-3">
        <h2 id="audit-title" className="text-2xl font-semibold tracking-tight">
          Recent changes
        </h2>
        <p className="text-muted-foreground">Every change made on the site or through a token, newest first.</p>
        {audit.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-5 text-muted-foreground">Nothing yet.</p>
        ) : (
          <ol className="grid divide-y rounded-2xl border bg-card shadow-sm">
            {audit.map((entry) => (
              <li key={entry.id} className="grid gap-0.5 p-4">
                <p>{entry.summary}</p>
                <p className="text-muted-foreground">
                  {formatTehranDateTime(entry.createdAt)} · by {entry.actor} · via {entry.source === "mcp" ? "a token" : "the website"}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function BackLink() {
  return (
    <Link href="/" className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4">
      <ArrowLeftIcon aria-hidden className="size-4" />
      Back to Team Reports
    </Link>
  );
}

function AdminSignIn() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="grid gap-2">
        <BackLink />
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">
          Manage people and API tokens. This needs the admin password, which is different from the team password.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <AdminLoginForm />
      </div>
    </main>
  );
}
