import Link from "next/link";
import { TOKEN_SCOPE_LABELS } from "@/lib/constants";
import { CopyBlock } from "./copy-block";

/**
 * How to connect an AI agent to this site. Shown on the main page and in /admin.
 * The address is filled in from the page the visitor is on.
 */
export function AgentGuide({ origin, audience }: { origin: string; audience: "team" | "admin" }) {
  const url = `${origin}/api/mcp`;
  const claudeCode = `claude mcp add --transport http team-reports ${url} --header "Authorization: Bearer YOUR_TOKEN"`;
  const settings = JSON.stringify(
    { mcpServers: { "team-reports": { type: "http", url, headers: { Authorization: "Bearer YOUR_TOKEN" } } } },
    null,
    2,
  );

  return (
    <div className="grid gap-6">
      <p>
        An agent is an AI assistant that can read these reports and add to them for you. It connects with a personal key,
        called a token, and can only do what that token allows.
      </p>

      <ol className="grid gap-6">
        <Step number={1} title="Get a token">
          <p>
            {audience === "admin" ? (
              <>Create one in &ldquo;API tokens&rdquo; above.</>
            ) : (
              <>
                Ask an admin to create one in{" "}
                <Link href="/admin" className="font-medium text-primary underline underline-offset-4">
                  Admin
                </Link>{" "}
                (it needs the admin password).
              </>
            )}{" "}
            Use one token per agent and tick only what it needs, so it can be switched off on its own. The token is shown
            once when it is created, so copy it then.
          </p>
        </Step>

        <Step number={2} title="Give the agent the address and the token">
          <CopyBlock label="Address" text={url} />
          <CopyBlock label="Claude Code: run this once, with your token in place of YOUR_TOKEN" text={claudeCode} />
          <CopyBlock label="Other agents that use a settings file (MCP over HTTP with headers)" text={settings} />
          <p className="text-muted-foreground">
            The agent sends the token as a header: <code>Authorization: Bearer YOUR_TOKEN</code>. An agent that can only run
            local programs can use the <code>mcp-remote</code> bridge with the same address and header.
          </p>
        </Step>

        <Step number={3} title="Check that it works">
          <p>
            Ask the agent: <em>&ldquo;Use team-reports to tell me who I am and what this week is.&rdquo;</em> It should answer
            with today&apos;s date, the current week and what its token may do.
          </p>
        </Step>
      </ol>

      <div className="grid gap-2">
        <h3 className="font-semibold">What an agent can do</h3>
        <p className="text-muted-foreground">Each permission on a token unlocks one kind of action. Without it, the agent never sees that tool.</p>
        <ul className="grid gap-2 rounded-xl border bg-card p-4">
          <Ability scope="reports:read">Look up a week, daily reports, decisions and past summaries.</Ability>
          <Ability scope="reports:write">Add or update a daily report.</Ability>
          <Ability scope="decisions:write">Raise a decision for the CEO.</Ability>
          <Ability scope="decisions:answer">Record the answer to a decision. Give this only to an agent that writes down what the CEO decided.</Ability>
          <Ability scope="weekly:write">Write the weekly summary as a draft.</Ability>
        </ul>
      </div>

      <div className="grid gap-2">
        <h3 className="font-semibold">Things you can ask</h3>
        <ul className="grid list-disc gap-1.5 pl-5">
          <li>&ldquo;What is blocking the team this week?&rdquo;</li>
          <li>&ldquo;Which decisions have been waiting the longest?&rdquo;</li>
          <li>&ldquo;Add my report for today: I finished the invoice export and I am waiting for access to the test data.&rdquo;</li>
          <li>&ldquo;Draft the weekly summary.&rdquo; (Agents with the prompt <code>draft_weekly_summary</code> follow the writing rules for you.)</li>
        </ul>
      </div>

      <div className="grid gap-2">
        <h3 className="font-semibold">Rules agents follow</h3>
        <ul className="grid list-disc gap-1.5 pl-5">
          <li>
            <strong>Weekly summaries are drafts.</strong> A person reads one and ticks &ldquo;final&rdquo; on this site. An
            agent can never change a summary that is already final.
          </li>
          <li>
            <strong>A token acts for one person.</strong> A token that belongs to a person only writes as that person. A team
            token must say who it writes for each time.
          </li>
          <li>
            <strong>The same checks as the forms.</strong> No future dates, plain business language in summaries, and a second
            report for the same person and day replaces the first.
          </li>
          <li>
            <strong>Everything is logged.</strong> Changes by an agent show in the admin log as &ldquo;via a token&rdquo;.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-3">
      <h3 className="flex items-center gap-3 font-semibold">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
        >
          {number}
        </span>
        <span>
          <span className="sr-only">Step {number}: </span>
          {title}
        </span>
      </h3>
      <div className="grid gap-3 sm:pl-10">{children}</div>
    </li>
  );
}

function Ability({ scope, children }: { scope: keyof typeof TOKEN_SCOPE_LABELS; children: React.ReactNode }) {
  return (
    <li className="grid gap-0.5 sm:grid-cols-[17rem_1fr] sm:gap-4">
      <span className="font-medium">{TOKEN_SCOPE_LABELS[scope]}</span>
      <span>{children}</span>
    </li>
  );
}
