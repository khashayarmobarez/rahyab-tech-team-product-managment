/**
 * The MCP server for agents. One server is built per request, for the token that
 * made it: an agent only sees the tools its token may use.
 *
 * Every tool calls the same functions in reports.ts that the website uses, so the
 * validation, the business rules and the audit log are identical. Writes are
 * recorded with the token's owner and the source "mcp".
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { hasScope, resolveActingPerson } from "@/lib/agent-access";
import { STATUS_COPY, STATUS_LABELS, type PersonSlug, type TokenScope } from "@/lib/constants";
import {
  formatWeekLabel,
  todayInTehran,
  weekEnd,
  weekStartOf,
  weeklyDueAt,
} from "@/lib/dates";
import { decisionAgeDays, parseWeekParam, reportedDays, summariseProgress } from "@/lib/rules";
import {
  answerDecisionSchema,
  dailyReportInputSchema,
  fieldErrorsOf,
  personSlugSchema,
  raiseDecisionSchema,
  ValidationError,
  weeklyReportInputSchema,
  type FieldErrors,
} from "@/lib/schemas";
import {
  answerDecision,
  getWeeklyReport,
  listDailyReports,
  listDailyReportsForWeek,
  listDecisions,
  listDecisionsForWeek,
  listPeople,
  listWeeklyReports,
  raiseDecision,
  saveDailyReport,
  saveWeeklyReport,
  type Actor,
  type DailyReport,
  type Decision,
  type WeeklyReport,
} from "./reports";

export type AgentAuth = { id: string; owner: string; scopes: TokenScope[] };

const SERVER_VERSION = "1.0.0";

/** The rules the CEO's summary must follow. Shown to agents in several places. */
export const WEEKLY_WRITING_RULES = [
  "Write for the CEO: plain business language and short sentences.",
  "No file names, folder paths or code terms. Say what changed for customers or the business, not how.",
  "Never invent results. Only list what the daily reports show is finished and checked. If unsure, put it under notFinished.",
  "Results: 1 to 5 items. By person: one line each, or leave empty for \"No report this week\".",
  `Status: ${STATUS_LABELS.map((l) => `${l} = ${STATUS_COPY[l].meaning}`).join("; ")}.`,
].join("\n");

const INSTRUCTIONS = `Team Reports holds the IT and software team's daily reports, decisions for the CEO, and weekly summaries.

Dates are calendar days in Tehran time (UTC+3:30), written YYYY-MM-DD. A week runs Saturday to Thursday; Friday is the day off and belongs to the week before it. Call whoami first to see today's date, the current week, who the team is, and what this token may do.

Saving a daily report for a person and date that already has one REPLACES it. Weekly summaries saved by agents are always drafts: a person marks them final on the website, and an agent cannot change a final one.

Rules for weekly summaries:
${WEEKLY_WRITING_RULES}`;

// --------------------------------------------------------------- results --

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function problem(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function describeErrors(errors: FieldErrors): string {
  return Object.entries(errors)
    .map(([field, messages]) => `${field === "_form" ? "problem" : field}: ${messages.join(" ")}`)
    .join("\n");
}

/** Thrown to refuse a request with a plain explanation for the agent. */
class Refusal extends Error {}

/** Runs a tool. Validation problems come back as readable tool errors the agent can act on. */
async function run(work: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await work());
  } catch (error) {
    if (error instanceof Refusal) return problem(error.message);
    const fields = fieldErrorsOf(error);
    if (fields) return problem(`Nothing was saved. Fix these and try again:\n${describeErrors(fields)}`);
    console.error("MCP tool failed:", error);
    return problem("Something went wrong on the server and nothing was changed. Try again later.");
  }
}

// --------------------------------------------------------- agent-facing shapes --

function dailyForAgent(r: DailyReport) {
  return {
    person: r.personSlug,
    name: r.personName,
    date: r.reportDate,
    title: r.title,
    summary: r.summary,
    done: r.done,
    blockers: r.blockers,
    next: r.next,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function weeklyForAgent(w: WeeklyReport) {
  return {
    weekStart: w.weekStart,
    weekEnd: weekEnd(w.weekStart),
    status: w.label,
    statusMeaning: STATUS_COPY[w.label].meaning,
    final: w.done,
    oneLine: w.oneLine,
    results: w.results,
    byPerson: w.byPerson,
    notFinished: w.notFinished,
    waitingForDecision: w.waitingDecisions,
    numbers: w.numbers,
    dueAt: w.dueAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

function decisionForAgent(d: Decision, asOf: string) {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    status: d.status,
    raisedOn: d.raisedOn,
    raisedBy: d.raisedBy,
    daysOpen: d.status === "open" ? decisionAgeDays(d.raisedOn, asOf) : undefined,
    answeredOn: d.answeredOn,
    answer: d.answer,
  };
}

// ------------------------------------------------------------ input shapes --
// Built from the same schemas the website's forms use. "person" is optional here
// because a token that belongs to a person always writes as that person.

const dateText = "A date written YYYY-MM-DD, Tehran time.";

const dailyInput = {
  person: personSlugSchema.optional().describe("Who the report is for. Optional for a token that belongs to one person; required for a team token."),
  reportDate: dailyReportInputSchema.shape.reportDate.optional().describe(`${dateText} Defaults to today. Not in the future.`),
  title: dailyReportInputSchema.shape.title.describe("What the day was about, in a few words."),
  summary: dailyReportInputSchema.shape.summary.describe("Two or three plain sentences."),
  done: dailyReportInputSchema.shape.done.describe("What was finished."),
  blockers: dailyReportInputSchema.shape.blockers.describe("Anything stopping the work. Empty if nothing."),
  next: dailyReportInputSchema.shape.next.describe("What comes next."),
};

const raiseInput = {
  person: personSlugSchema.optional().describe("Who is raising it. Optional for a token that belongs to one person; required for a team token."),
  title: raiseDecisionSchema.shape.title.describe("The question, in one line."),
  description: raiseDecisionSchema.shape.description.describe("The choices and why it matters now."),
};

const answerInput = {
  person: personSlugSchema.optional().describe("Who is recording the answer. Optional for a token that belongs to one person; required for a team token."),
  decisionId: answerDecisionSchema.shape.decisionId.describe("The id of an open decision, from get_decisions."),
  answer: answerDecisionSchema.shape.answer.describe("What was decided, in the decider's own terms."),
};

const weeklyInput = {
  person: personSlugSchema.optional().describe("Who is writing the summary. Optional for a token that belongs to one person; required for a team token."),
  weekStart: weeklyReportInputSchema.shape.weekStart.optional().describe("The Saturday the week starts on. Defaults to the current week."),
  oneLine: weeklyReportInputSchema.shape.oneLine.describe("The whole week in one plain sentence."),
  results: weeklyReportInputSchema.shape.results.describe("1 to 5 finished and checked results, in plain business words."),
  byPerson: weeklyReportInputSchema.shape.byPerson
    .optional()
    .describe('One plain line per person: keys khashayar, mahan, hossein. Leave out or empty for "No report this week".'),
  notFinished: weeklyReportInputSchema.shape.notFinished.describe("Work that is not done yet."),
  label: weeklyReportInputSchema.shape.label.describe(
    `Status: ${STATUS_LABELS.map((l) => `${l} = ${STATUS_COPY[l].meaning}`).join("; ")}.`,
  ),
};

// ----------------------------------------------------------------- server --

export function createMcpServer(auth: AgentAuth): McpServer {
  const server = new McpServer({ name: "team-reports", version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  const ctx: Actor = { actor: auth.owner, source: "mcp" };
  const can = (scope: TokenScope) => hasScope(auth.scopes, scope);

  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
  const writes = { readOnlyHint: false, idempotentHint: true, openWorldHint: false } as const;

  /** Who a write is for. Refuses, with an explanation, if the token may not write as that person. */
  const actingPerson = (requested: string | undefined): PersonSlug => {
    const who = resolveActingPerson(auth.owner, requested);
    if (!who.ok) throw new Refusal(who.message);
    return who.person;
  };

  // ---- always available

  server.registerTool(
    "whoami",
    {
      title: "Who am I, and what is today?",
      description:
        "Start here. Returns what this token may do, today's date and the current week (Tehran time), the people on the team, and the writing rules for weekly summaries.",
      annotations: readOnly,
    },
    async () =>
      run(async () => {
        const today = todayInTehran();
        const week = weekStartOf(today);
        return {
          tokenOwner: auth.owner,
          permissions: auth.scopes,
          today,
          currentWeek: { start: week, end: weekEnd(week), label: formatWeekLabel(week), summaryDueAt: weeklyDueAt(week).toISOString() },
          team: (await listPeople()).map((p) => ({ person: p.slug, name: p.name, active: p.active })),
          weeklySummaryRules: WEEKLY_WRITING_RULES,
        };
      }),
  );

  // ---- reading

  if (can("reports:read")) {
    server.registerTool(
      "get_week_overview",
      {
        title: "Overview of a week",
        description:
          "Everything about one week in one call: the weekly summary if there is one, the daily reports (newest first), which days each person reported, a built-from-reports progress summary, and the decisions open during that week.",
        inputSchema: {
          week: z.string().optional().describe(`Any date in the week you want, ${dateText} Defaults to the current week.`),
        },
        annotations: readOnly,
      },
      async ({ week }) =>
        run(async () => {
          const today = todayInTehran();
          const current = weekStartOf(today);
          const requested = week === undefined ? current : parseWeekParam(week);
          if (requested === undefined) throw new ValidationError({ week: ["Use a real date written like 2026-11-14."] });
          const weekStart = requested > current ? current : requested;
          const [people, daily, weekly, decisionView] = await Promise.all([
            listPeople(),
            listDailyReportsForWeek(weekStart),
            getWeeklyReport(weekStart),
            listDecisionsForWeek(weekStart, today),
          ]);
          const days: Record<string, string[]> = {};
          for (const p of people) days[p.slug] = [...reportedDays(daily, p.slug)].sort();
          return {
            week: { start: weekStart, end: weekEnd(weekStart), label: formatWeekLabel(weekStart), isCurrentWeek: weekStart === current },
            weeklySummary: weekly ? weeklyForAgent(weekly) : null,
            summaryDueAt: weeklyDueAt(weekStart).toISOString(),
            builtFromDailyReports: summariseProgress(daily),
            daysWithAReport: days,
            dailyReports: daily.map(dailyForAgent),
            decisions: {
              asOf: decisionView.asOf,
              open: decisionView.open.map((d) => decisionForAgent(d, decisionView.asOf)),
              recentlyAnswered: decisionView.recentlyAnswered.map((d) => decisionForAgent(d, decisionView.asOf)),
            },
          };
        }),
    );

    server.registerTool(
      "get_daily_reports",
      {
        title: "Daily reports in a date range",
        description: "Daily reports between two dates, newest first. At most 92 days and 200 reports per call.",
        inputSchema: {
          from: z.string().describe(`First day. ${dateText}`),
          to: z.string().optional().describe(`Last day. ${dateText} Defaults to today.`),
          person: personSlugSchema.optional().describe("Only this person's reports."),
          limit: z.number().int().min(1).max(200).optional().describe("Most reports to return. Default 100."),
        },
        annotations: readOnly,
      },
      async ({ from, to, person, limit }) =>
        run(async () => {
          const reports = await listDailyReports({ from, to: to ?? todayInTehran(), person: person as PersonSlug | undefined, limit });
          return { count: reports.length, reports: reports.map(dailyForAgent) };
        }),
    );

    server.registerTool(
      "get_decisions",
      {
        title: "Decisions",
        description: "Decisions for the CEO and the team. Open ones come oldest first with how many days they have waited.",
        inputSchema: {
          status: z.enum(["open", "answered", "all"]).optional().describe('Default "open".'),
          limit: z.number().int().min(1).max(200).optional().describe("Most decisions to return. Default 50."),
        },
        annotations: readOnly,
      },
      async ({ status, limit }) =>
        run(async () => {
          const today = todayInTehran();
          const list = await listDecisions({ status, limit });
          return { count: list.length, decisions: list.map((d) => decisionForAgent(d, today)) };
        }),
    );

    server.registerTool(
      "get_weekly_reports",
      {
        title: "Weekly summaries",
        description:
          "One weekly summary when you give weekStart (a Saturday), otherwise the most recent summaries, newest first.",
        inputSchema: {
          weekStart: z.string().optional().describe("A Saturday, YYYY-MM-DD. Leave out to list recent weeks."),
          limit: z.number().int().min(1).max(52).optional().describe("How many recent weeks to list. Default 8."),
        },
        annotations: readOnly,
      },
      async ({ weekStart, limit }) =>
        run(async () => {
          if (weekStart !== undefined) {
            const start = parseWeekParam(weekStart);
            if (start === undefined) throw new ValidationError({ weekStart: ["Use a real date written like 2026-11-14."] });
            const report = await getWeeklyReport(start);
            return { weekStart: start, weeklySummary: report ? weeklyForAgent(report) : null };
          }
          const list = await listWeeklyReports({ limit: limit ?? 8 });
          return { count: list.length, weeklySummaries: list.map(weeklyForAgent) };
        }),
    );
  }

  // ---- writing

  if (can("reports:write")) {
    server.registerTool(
      "save_daily_report",
      {
        title: "Save a daily report",
        description:
          "Saves one person's report for one day. If that person already has a report for that date it is REPLACED, so send the whole report each time. Not allowed for a day that has not happened yet.",
        inputSchema: dailyInput,
        annotations: writes,
      },
      async (input) =>
        run(async () => {
          const person = actingPerson(input.person);
          const { report, replaced } = await saveDailyReport(
            { ...input, person, reportDate: input.reportDate ?? todayInTehran() },
            ctx,
          );
          return { saved: true, replacedEarlierReport: replaced, report: dailyForAgent(report) };
        }),
    );
  }

  if (can("decisions:write")) {
    server.registerTool(
      "raise_decision",
      {
        title: "Raise a decision",
        description:
          "Raises something that needs an answer from the CEO or the team. It shows under \"Needs a decision\" until someone answers it. Check get_decisions first so you do not raise it twice.",
        inputSchema: raiseInput,
        annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (input) =>
        run(async () => {
          const person = actingPerson(input.person);
          const decision = await raiseDecision({ ...input, person }, ctx);
          return { raised: true, decision: decisionForAgent(decision, todayInTehran()) };
        }),
    );
  }

  if (can("decisions:answer")) {
    server.registerTool(
      "answer_decision",
      {
        title: "Record the answer to a decision",
        description:
          "Marks an open decision as answered. Use it only to record an answer the CEO or a manager has actually given. Never decide on their behalf. A decision can be answered once.",
        inputSchema: answerInput,
        annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (input) =>
        run(async () => {
          const person = actingPerson(input.person);
          const decision = await answerDecision({ ...input, person }, ctx);
          return { answered: true, decision: decisionForAgent(decision, todayInTehran()) };
        }),
    );
  }

  if (can("weekly:write")) {
    server.registerTool(
      "save_weekly_report",
      {
        title: "Save a weekly summary draft",
        description: `Saves the weekly summary for a week as a DRAFT, replacing an earlier draft. A person must read it and mark it final on the website; you cannot do that, and you cannot change a summary that is already final. The numbers and the "waiting for a decision" list are worked out from the real data, so do not write them.\n\nRules:\n${WEEKLY_WRITING_RULES}`,
        inputSchema: weeklyInput,
        annotations: writes,
      },
      async (input) =>
        run(async () => {
          const person = actingPerson(input.person);
          const { report, replaced } = await saveWeeklyReport(
            {
              person,
              weekStart: input.weekStart ?? weekStartOf(todayInTehran()),
              oneLine: input.oneLine,
              results: input.results,
              byPerson: input.byPerson ?? {},
              notFinished: input.notFinished,
              label: input.label,
              done: false,
            },
            ctx,
            { draftOnly: true },
          );
          return {
            saved: true,
            asDraft: true,
            replacedEarlierDraft: replaced,
            note: "A person still has to mark this summary final on the website.",
            weeklySummary: weeklyForAgent(report),
          };
        }),
    );

    if (can("reports:read")) {
      server.registerPrompt(
        "draft_weekly_summary",
        {
          title: "Draft the weekly summary",
          description: "Writes the CEO's weekly summary from the real daily reports and saves it as a draft.",
          argsSchema: { week: z.string().optional().describe(`Any date in the week, ${dateText} Defaults to the current week.`) },
        },
        ({ week }) => ({
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Draft the weekly summary for ${week ? `the week containing ${week}` : "the current week"}.

1. Call get_week_overview${week ? ` with week "${week}"` : ""} and read the daily reports, blockers and open decisions.
2. Write the summary using ONLY what those reports show. Do not invent or round up results.
3. Follow these rules:
${WEEKLY_WRITING_RULES}
4. Call save_weekly_report with the week's start date. It is saved as a draft.
5. Tell the user what you saved and that a person must read it and mark it final on the website.`,
              },
            },
          ],
        }),
      );
    }
  }

  return server;
}
