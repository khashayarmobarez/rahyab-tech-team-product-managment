import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { CopyBlock } from "@/components/page/copy-block";
import { requireSiteSession } from "@/server/auth";
import { siteOrigin } from "@/server/origin";

export const metadata: Metadata = { title: "Guide your agent · Team Reports" };

const SECTIONS = [
  { id: "start", label: "Before you start" },
  { id: "instructions", label: "Standing instructions" },
  { id: "prompts", label: "What to say" },
  { id: "automatic", label: "Make it automatic" },
  { id: "tokens", label: "Which token" },
  { id: "example", label: "A good report" },
  { id: "problems", label: "When it goes wrong" },
];

/** The agent's standing instructions: paste into the project's instruction file (CLAUDE.md, AGENTS.md or similar). */
const STANDING_INSTRUCTIONS = `## Team Reports (MCP server "team-reports")

Use the team-reports tools to read and write the team's reports. The reader is the CEO, not an engineer.

Always:
- Call whoami first. It gives today's date (Tehran time), the current week and what the token may do.
- Build reports only from work that really happened today (sessions, commits, notes). Never invent progress.
- Use plain business words: what changed for users or the business. No file names, folder paths, function names,
  credentials, email addresses or personal data.

Daily report (save_daily_report):
- First call get_daily_reports for this person and today. Saving REPLACES the day's report, so start from what it
  says and add what is new. Never drop earlier work from today.
- title: what the day was about, a few words, no date and no name.
- project: the product or project, a short name. Check the last two weeks of reports and reuse the same spelling.
  Leave it out if the day was not about one project.
- summary: two or three plain sentences. End with what was NOT verified (built but not tested, or only checked by code).
- done: finished outcomes, one string each. blockers: only real blockers that need someone above the team, else [].
  next: what is half done and what comes next.

Decisions:
- Before raise_decision, call get_decisions (open) and do not repeat one that already says the same.
- Never call answer_decision unless a person tells you the CEO's answer and asks you to record it.

Weekly summary (save_weekly_report):
- Saved only as a draft. A person marks it final on the website. Use only what the daily reports show is finished
  and checked; anything unsure goes under notFinished. 1 to 5 results, no code terms.

If a tool call fails, say so and what the message was. Do not retry in a loop.`;

const DAILY_PROMPT = `Write my daily report for today and save it to Team Reports. I am Khashayar.
Use what I actually did today: check my sessions and commits, and read what is already saved so you add to it
instead of replacing it. Keep it in business words, and end the summary with what was not tested.`;

const SCHEDULED_PROMPT = `Run the daily report for Mahan: read today's work, call get_daily_reports for today, then
save_daily_report with the whole report (earlier items kept, new work added). If nothing new happened since the last
save, leave the report as it is. Reply with what you saved and the three things you were least sure about.`;

const WEEKLY_PROMPT = `Draft the weekly summary for this week from the team's daily reports and save it as a draft.
Only list what the daily reports show is finished and checked; put the rest under not finished. Tell me when it is
saved so a person can read it and mark it final.`;

export default function DocsPage() {
  return (
    <Suspense fallback={<div className="m-4 mx-auto h-64 w-full max-w-3xl animate-pulse rounded-2xl bg-muted" role="status" aria-label="Loading guide" />}>
      <Docs />
    </Suspense>
  );
}

async function Docs() {
  await requireSiteSession();
  const origin = await siteOrigin();
  const url = `${origin}/api/mcp`;

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-6 sm:py-10 print:max-w-none">
      <div className="grid gap-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4">
          <ArrowLeftIcon aria-hidden className="size-4" />
          Back to Team Reports
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Guide your agent</h1>
        <p className="text-lg text-muted-foreground">
          An AI agent can write your daily report, check what is blocking the team and draft the weekly summary. It does
          this well only if it knows the rules. This page gives you the words to say and the instructions to paste.
        </p>
        <nav aria-label="On this page" className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border px-3 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      <Section id="start" title="Before you start">
        <p>
          The agent needs two things: the address of this site&apos;s agent door and a personal token. Setting that up takes
          a few minutes and is explained step by step in{" "}
          <Link href="/#agents" className="font-medium text-primary underline underline-offset-4">
            Connect an agent
          </Link>
          .
        </p>
        <CopyBlock label="Address to give the agent" text={url} />
        <p>
          Once it is connected, ask: <em>&ldquo;Use team-reports to tell me who I am and what this week is.&rdquo;</em> If it
          answers with today&apos;s date and the current week, you are ready.
        </p>
      </Section>

      <Section id="instructions" title="Give it standing instructions">
        <p>
          An agent forgets between chats. Put the rules in the instruction file of the project it works in (for Claude Code
          that is <code>CLAUDE.md</code>; other tools call it <code>AGENTS.md</code> or &ldquo;project instructions&rdquo;).
          Then every session follows them without being reminded. Paste this once:
        </p>
        <CopyBlock label="Paste into the project's instruction file" text={STANDING_INSTRUCTIONS} />
        <p className="text-muted-foreground">
          Why each rule is there: saving a report replaces the whole day, so the agent must read first; the CEO reads these
          pages, so plain words matter; and the weekly summary is a draft because a person is responsible for what the CEO
          sees.
        </p>
      </Section>

      <Section id="prompts" title="What to say">
        <p>Short, specific requests work best. Name the person and say where the facts come from.</p>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <h3 className="font-semibold">Your daily report</h3>
            <CopyBlock label="Daily report" text={DAILY_PROMPT} />
            <p className="text-muted-foreground">
              Run it more than once a day if you like. Each run adds to the same report; it never creates a second one.
            </p>
          </div>

          <div className="grid gap-2">
            <h3 className="font-semibold">Weekly summary</h3>
            <CopyBlock label="Weekly summary" text={WEEKLY_PROMPT} />
            <p className="text-muted-foreground">
              It always arrives as a draft. Open the week on the main page, read it, and mark it final yourself.
            </p>
          </div>

          <div className="grid gap-2">
            <h3 className="font-semibold">Questions (any token that can read)</h3>
            <ul className="grid list-disc gap-1.5 pl-5">
              <li>&ldquo;What is blocking the team this week?&rdquo;</li>
              <li>&ldquo;Which decisions have waited longest, and for how many days?&rdquo;</li>
              <li>&ldquo;What did Mahan finish on Tuesday?&rdquo;</li>
              <li>&ldquo;How many days did each of us report in the last four weeks?&rdquo;</li>
            </ul>
          </div>

          <div className="grid gap-2">
            <h3 className="font-semibold">Decisions</h3>
            <ul className="grid list-disc gap-1.5 pl-5">
              <li>
                &ldquo;Raise a decision: we need to choose between buying the data feed or building it. Explain both
                options and what waiting costs.&rdquo; The agent checks for a duplicate first.
              </li>
              <li>
                &ldquo;The CEO said yes to the data feed. Record that answer on the open decision.&rdquo; Only an agent whose
                token has the &ldquo;answer decisions&rdquo; permission can do this, and a decision can be answered once.
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="automatic" title="Make it automatic">
        <p>
          Anything that can start your agent on a timer can write the report for you: a scheduled task in your agent app, a
          cron job, or a CI schedule. Give it the same prompt each time and a token that belongs to you. A good rhythm:
        </p>
        <ul className="grid list-disc gap-1.5 pl-5">
          <li>
            <strong>Daily report</strong> two or three times a day, for example at lunch, late afternoon and end of day.
          </li>
          <li>
            <strong>Weekly summary</strong> on Thursday evening. The week runs Saturday to Thursday and the summary is due
            Thursday 23:59 Tehran time.
          </li>
        </ul>
        <CopyBlock label="A prompt for a scheduled daily run" text={SCHEDULED_PROMPT} />
        <p className="text-muted-foreground">
          The line &ldquo;if nothing new happened, leave the report as it is&rdquo; stops repeated runs from rewriting the
          same text. A quiet day is a fine report.
        </p>
      </Section>

      <Section id="tokens" title="Which token for which job">
        <p>
          A token only lets the agent do what its permissions say, and it only sees those tools. Make one token per agent so
          you can switch it off without disturbing the others. An admin creates them in{" "}
          <Link href="/admin" className="font-medium text-primary underline underline-offset-4">
            Admin
          </Link>
          .
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 font-semibold">Job</th>
                <th className="p-3 font-semibold">Belongs to</th>
                <th className="p-3 font-semibold">Permissions to tick</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-3">Writes my daily report</td>
                <td className="p-3">Me</td>
                <td className="p-3">Read reports, write reports, raise decisions</td>
              </tr>
              <tr>
                <td className="p-3">Drafts the weekly summary</td>
                <td className="p-3">The team</td>
                <td className="p-3">Read reports, write the weekly summary</td>
              </tr>
              <tr>
                <td className="p-3">Answers the CEO&apos;s questions</td>
                <td className="p-3">The team</td>
                <td className="p-3">Read reports only</td>
              </tr>
              <tr>
                <td className="p-3">Records what the CEO decided</td>
                <td className="p-3">The CEO&apos;s assistant</td>
                <td className="p-3">Read reports, answer decisions</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          A token that belongs to a person can only write as that person. A team token has to say who it writes for every
          time, so mention the name in the prompt.
        </p>
      </Section>

      <Section id="example" title="What a good report looks like">
        <p>Show this to your agent if its reports come out too technical or too vague.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-2 rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Too technical</h3>
            <p className="text-muted-foreground">&ldquo;Refactored the export module, fixed null check in the formatter, 12 tests added.&rdquo;</p>
            <p className="text-muted-foreground">The CEO cannot tell what changed or whether it matters.</p>
          </div>
          <div className="grid content-start gap-2 rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Clear</h3>
            <p>
              <strong>Done:</strong> Finance can now download the monthly invoice list as a spreadsheet.
            </p>
            <p>
              <strong>Summary:</strong> The invoice export works with last month&apos;s real data. It has not been tried on
              a phone or with the largest accounts.
            </p>
            <p>
              <strong>Blocked:</strong> Waiting for access to the test accounts from the bank.
            </p>
            <p>
              <strong>Next:</strong> Try the largest accounts, then send it to Finance for a check.
            </p>
          </div>
        </div>
      </Section>

      <Section id="problems" title="When it goes wrong">
        <p>The agent should tell you the message it got. Here is what the common ones mean.</p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 font-semibold">What you see</th>
                <th className="p-3 font-semibold">What to do</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-3">401, or the tools do not appear</td>
                <td className="p-3">The token is wrong, switched off or not sent. Make a new one and add the agent again.</td>
              </tr>
              <tr>
                <td className="p-3">A tool is missing (for example, it cannot save)</td>
                <td className="p-3">The token lacks that permission. Ask an admin to make one with it ticked.</td>
              </tr>
              <tr>
                <td className="p-3">&ldquo;This token belongs to … so it can only write as …&rdquo;, or &ldquo;This is a team token, so person is required&rdquo;</td>
                <td className="p-3">A personal token only writes as its owner. Use your own token, or a team token and name the person in the prompt.</td>
              </tr>
              <tr>
                <td className="p-3">A future date is refused</td>
                <td className="p-3">Reports are only for days that have happened. Use today or earlier, in Tehran time.</td>
              </tr>
              <tr>
                <td className="p-3">The weekly summary is refused for code terms</td>
                <td className="p-3">Ask the agent to rewrite it with no file names, folders or code words.</td>
              </tr>
              <tr>
                <td className="p-3">Earlier work vanished from today&apos;s report</td>
                <td className="p-3">
                  A save replaces the whole report. Tell the agent to read today&apos;s report first and send everything
                  again. The standing instructions above prevent this.
                </td>
              </tr>
              <tr>
                <td className="p-3">429, too many requests</td>
                <td className="p-3">The agent is looping. Stop it, then ask for one run at a time.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          Every change an agent makes is in the admin log marked &ldquo;via a token&rdquo;, so you can always see what it did.
          Tool names and exact inputs for people who build agents are in the technical guide (<code>docs/mcp.md</code> in the
          project).
        </p>
      </Section>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-4 gap-4">
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}
