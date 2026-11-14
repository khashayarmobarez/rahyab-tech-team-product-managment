/**
 * npm run seed
 *
 * Applies the database migrations (which also creates the three people), then
 * adds some sample data: daily reports for the last two weeks and this week so far, two
 * weekly summaries, and a few decisions. Safe to run again: it replaces the
 * sample reports instead of adding copies.
 *
 * The data goes through the same service functions the web app uses. Those
 * write an audit row for every change; here the "who" is "seed".
 */
import "./env";
import { eq } from "drizzle-orm";
import { PERSON_SLUGS, type PersonSlug } from "../src/lib/constants";
import { addDays, previousWeekStart, todayInTehran, weekDays, weekStartOf } from "../src/lib/dates";
import { closeDb, getDb } from "../src/server/db";
import { decisions } from "../src/server/db/schema";
import { runMigrations } from "../src/server/migrate";
import {
  answerDecision,
  raiseDecision,
  saveDailyReport,
  saveWeeklyReport,
  type Actor,
} from "../src/server/reports";

const ctx: Actor = { actor: "seed", source: "web" };

type Template = {
  title: string;
  summary: string;
  done: string[];
  blockers: string[];
  next: string[];
};

/** Six days of work for each person; the seed cycles through them. */
const TEMPLATES: Record<PersonSlug, Template[]> = {
  khashayar: [
    {
      title: "Online invoice payments",
      summary: "Worked through the payment flow with the bank's test system and listed what is left before customers can use it.",
      done: ["Payment flow works end to end in the test system", "Wrote the list of remaining checks"],
      blockers: [],
      next: ["Check refunds", "Review the wording on the payment page"],
    },
    {
      title: "Online invoice payments",
      summary: "Refunds now work. Started on the confirmation emails customers receive after paying.",
      done: ["Refunds work in the test system"],
      blockers: ["Waiting for the bank to confirm our live account details"],
      next: ["Finish the confirmation emails"],
    },
    {
      title: "Payment emails and support",
      summary: "Finished the confirmation emails and answered two urgent questions from the support team.",
      done: ["Confirmation emails finished", "Answered two support questions"],
      blockers: ["Waiting for the bank to confirm our live account details"],
      next: ["Test the full flow with a real small payment once the bank confirms"],
    },
    {
      title: "Launch preparation",
      summary: "Prepared the launch checklist and walked the support team through the new payment page.",
      done: ["Launch checklist ready", "Support team briefed"],
      blockers: [],
      next: ["Final review with the team"],
    },
    {
      title: "Launch day checks",
      summary: "Ran the final checks. Payments are ready to switch on.",
      done: ["Final checks passed", "Agreed the switch-on time with support"],
      blockers: [],
      next: ["Switch on payments and watch the first customers"],
    },
    {
      title: "First week of live payments",
      summary: "Payments are live. Watching the first customers closely and fixing small issues.",
      done: ["Payments switched on", "Fixed a confusing error message"],
      blockers: [],
      next: ["Review the first week of payments"],
    },
  ],
  mahan: [
    {
      title: "Management reporting screens",
      summary: "Built the first version of the monthly overview screen and compared its numbers with finance's spreadsheet.",
      done: ["First version of the monthly overview", "Numbers match finance for the last quarter"],
      blockers: [],
      next: ["Add the customer breakdown"],
    },
    {
      title: "Management reporting screens",
      summary: "Added the customer breakdown. Two customers show different totals than finance; checking why.",
      done: ["Customer breakdown added"],
      blockers: ["Two customers' totals differ from finance and the cause is not clear yet"],
      next: ["Find the cause of the difference"],
    },
    {
      title: "Reporting: fixing the totals",
      summary: "Found the cause. Old invoices were counted twice. Fixed it and re-checked every customer.",
      done: ["Found and fixed the double counting", "Re-checked all customers against finance"],
      blockers: [],
      next: ["Ask finance to review the screens"],
    },
    {
      title: "Reporting: review with finance",
      summary: "Finance reviewed the screens and asked for two changes to labels and one extra column.",
      done: ["Review session with finance"],
      blockers: [],
      next: ["Make the changes finance asked for"],
    },
    {
      title: "Reporting: changes from review",
      summary: "Made the changes finance asked for. The screens are ready for the CEO to look at.",
      done: ["Labels updated", "Extra column added"],
      blockers: ["Waiting for a decision on the launch date"],
      next: ["Prepare a short demo"],
    },
    {
      title: "Reporting: demo preparation",
      summary: "Prepared a ten-minute demo and a one-page guide for managers.",
      done: ["Demo ready", "One-page guide for managers"],
      blockers: ["Waiting for a decision on the launch date"],
      next: ["Give the demo"],
    },
  ],
  hossein: [
    {
      title: "System speed and reliability",
      summary: "Measured how long the busiest pages take to load and picked the three slowest for the first round of fixes.",
      done: ["Measured the busiest pages", "Chose the three slowest pages to fix first"],
      blockers: [],
      next: ["Start fixing the slowest page"],
    },
    {
      title: "System speed and reliability",
      summary: "The slowest page now loads in about a third of the time. Moving on to the second.",
      done: ["Slowest page is about three times faster"],
      blockers: [],
      next: ["Fix the second slowest page"],
    },
    {
      title: "Backups",
      summary: "Tested restoring last night's backup. It worked, and it took under an hour.",
      done: ["Restored a backup in a practice run", "Wrote down the steps for the team"],
      blockers: [],
      next: ["Set a reminder to practise every month"],
    },
    {
      title: "Release checking",
      summary: "Looked at how we check releases before customers see them. We only have one test copy, which slows everyone down.",
      done: ["Reviewed the release process"],
      blockers: ["Releases queue up because there is only one test copy of the system"],
      next: ["Put a proposal for a second test copy to the CEO"],
    },
    {
      title: "System speed and reliability",
      summary: "Second slowest page is faster. Third page started.",
      done: ["Second slowest page fixed"],
      blockers: ["Releases queue up because there is only one test copy of the system"],
      next: ["Finish the third page"],
    },
    {
      title: "Reliability review",
      summary: "Went through last month's outages with the team and agreed three small changes to prevent a repeat.",
      done: ["Outage review held", "Three prevention changes agreed"],
      blockers: [],
      next: ["Make the three changes"],
    },
  ],
};

/** Days (0 = Saturday) a person has no report in past weeks, so the week strips are not all full. */
const SKIPS: Partial<Record<PersonSlug, number[]>> = {
  mahan: [3],
  hossein: [1, 5],
};

async function seedDailyReports(today: string): Promise<number> {
  const thisWeek = weekStartOf(today);
  const weeks = [previousWeekStart(previousWeekStart(thisWeek)), previousWeekStart(thisWeek), thisWeek];
  let count = 0;
  for (const weekStart of weeks) {
    // Saturday to Thursday: the first six days. Friday is the day off.
    for (const [dayIndex, date] of weekDays(weekStart).slice(0, 6).entries()) {
      if (date > today) continue;
      for (const slug of PERSON_SLUGS) {
        const isCurrentWeek = weekStart === thisWeek;
        if (!isCurrentWeek && SKIPS[slug]?.includes(dayIndex)) continue;
        const template = TEMPLATES[slug][dayIndex % TEMPLATES[slug].length];
        await saveDailyReport({ person: slug, reportDate: date, ...template }, ctx);
        count++;
      }
    }
  }
  return count;
}

async function seedWeeklyReports(today: string): Promise<void> {
  const lastWeek = previousWeekStart(weekStartOf(today));
  const twoWeeksAgo = previousWeekStart(lastWeek);

  await saveWeeklyReport(
    {
      person: "khashayar",
      weekStart: twoWeeksAgo,
      oneLine: "Online payments and the reporting screens are both partly built; nothing is ready for customers yet.",
      results: [
        "Payment flow works in the bank's test system",
        "First version of the monthly overview screen is built",
        "Slowest pages measured and the worst three picked for fixing",
      ],
      byPerson: {
        khashayar: "Payment flow works in the test system; refunds are next",
        mahan: "Monthly overview built; two customers' totals still differ from finance",
        hossein: "Measured page speed and chose what to fix first",
      },
      notFinished: ["Refunds", "Customer breakdown in the overview", "Fixes for slow pages"],
      label: "yellow",
      done: true,
    },
    ctx,
  );

  await saveWeeklyReport(
    {
      person: "khashayar",
      weekStart: lastWeek,
      oneLine: "Online payments are ready to switch on, and the reporting screens passed finance's review.",
      results: [
        "Online payments finished and checked, ready to switch on",
        "Reporting screens match finance's numbers and passed their review",
        "The three slowest pages are now noticeably faster",
        "Backup restore practised: back to normal in under an hour",
      ],
      byPerson: {
        khashayar: "Payments finished; launch checklist ready",
        mahan: "Totals fixed and approved by finance; demo being prepared",
        hossein: "Faster pages, tested backups, outage review held",
      },
      notFinished: ["A second test copy of the system, waiting on a budget decision"],
      label: "green",
      done: true,
    },
    ctx,
  );
}

type SampleDecision = {
  person: PersonSlug;
  title: string;
  description: string;
  raisedDaysAgo: number;
  answer?: { by: PersonSlug; text: string; answeredDaysAgo: number };
};

const SAMPLE_DECISIONS: SampleDecision[] = [
  {
    person: "hossein",
    title: "Approve a second test copy of the system",
    description:
      "Releases wait in a queue because we have only one test copy. A second one would let two changes be checked at the same time and would reduce launch delays. It has a small monthly cost.",
    raisedDaysAgo: 5,
  },
  {
    person: "mahan",
    title: "Choose the launch date for the new reporting screens",
    description:
      "The screens are finished and finance has approved the numbers. We can launch next week, or wait until after month-end close to avoid confusing the finance team.",
    raisedDaysAgo: 2,
  },
  {
    person: "khashayar",
    title: "Keep Friday on-call cover for payments?",
    description:
      "Once payments are live, a customer could be unable to pay on a Friday. Do we want someone available that day, or can issues wait until Saturday?",
    raisedDaysAgo: 12,
    answer: {
      by: "khashayar",
      text: "Yes, one person on call every Friday for the first two months, then we review.",
      answeredDaysAgo: 9,
    },
  },
];

async function seedDecisions(today: string): Promise<number> {
  const db = getDb();
  let created = 0;
  for (const sample of SAMPLE_DECISIONS) {
    const [existing] = await db.select({ id: decisions.id }).from(decisions).where(eq(decisions.title, sample.title));
    if (existing) continue;
    const decision = await raiseDecision(
      { person: sample.person, title: sample.title, description: sample.description },
      ctx,
    );
    const raisedOn = addDays(today, -sample.raisedDaysAgo);
    let answeredOn: string | null = null;
    if (sample.answer) {
      await answerDecision({ person: sample.answer.by, decisionId: decision.id, answer: sample.answer.text }, ctx);
      answeredOn = addDays(today, -sample.answer.answeredDaysAgo);
    }
    // Sample data only: move the dates back so the page shows decisions of different ages.
    await db.update(decisions).set({ raisedOn, ...(answeredOn ? { answeredOn } : {}) }).where(eq(decisions.id, decision.id));
    created++;
  }
  return created;
}

async function main(): Promise<void> {
  try {
    const today = todayInTehran();
    await runMigrations();
    const reports = await seedDailyReports(today);
    await seedWeeklyReports(today);
    const newDecisions = await seedDecisions(today);
    console.log(
      `Seed finished (today in Tehran: ${today}): 3 people, ${reports} daily reports, 2 weekly summaries, ${newDecisions} new decisions.`,
    );
  } catch (error) {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
