"use server";

import { refresh } from "next/cache";
import { failure, type ActionResult } from "@/lib/action-result";
import { isDateString, isWeekStart } from "@/lib/dates";
import {
  parseAnswerDecisionForm,
  parseDailyForm,
  parseRaiseDecisionForm,
  parseReviewForm,
  parseWeeklyForm,
} from "@/lib/form-parsers";
import { answererSchema, fieldErrorsOf, personSlugSchema } from "@/lib/schemas";
import { getRole, requireSiteSession } from "@/server/auth";
import {
  answerDecision,
  getDailyReport,
  getWeeklyReport,
  raiseDecision,
  saveDailyReport,
  saveReportReview,
  saveWeeklyReport,
} from "@/server/reports";

/** Maps anything thrown by the service layer to something a form can show. */
function toFailure(error: unknown): ActionResult<never> {
  const fieldErrors = fieldErrorsOf(error);
  if (fieldErrors) return failure(fieldErrors);
  console.error(error);
  return failure({}, "Something went wrong and nothing was saved. Please try again.");
}

/** For the audit log: the person picked in the form, as long as it is one of ours. */
function actorOf(person: unknown): string {
  const parsed = answererSchema.safeParse(person);
  return parsed.success ? parsed.data : "unknown";
}

const CEO_CANNOT_WRITE = "You are signed in as the CEO. Reports, decisions and weekly summaries are written by the team.";

/** Writing reports belongs to the team. A visitor signed in with the CEO password is refused. */
async function refuseCeo(): Promise<ActionResult<never> | null> {
  return (await getRole()) === "ceo" ? failure({}, CEO_CANNOT_WRITE) : null;
}

// ----------------------------------------------------------- daily report --

export async function saveDailyReportAction(formData: FormData): Promise<ActionResult> {
  await requireSiteSession();
  const refused = await refuseCeo();
  if (refused) return refused;
  const input = parseDailyForm(formData);
  try {
    const { replaced } = await saveDailyReport(input, { actor: actorOf(input.person), source: "web" });
    refresh();
    return { ok: true, message: replaced ? "Report updated. It replaces the earlier one for that day." : "Report saved." };
  } catch (error) {
    return toFailure(error);
  }
}

export type LoadedDailyReport =
  | { found: false }
  | { found: true; title: string; project: string; summary: string; done: string[]; blockers: string[]; next: string[] };

/** Used by the form to load an existing report when the person or date changes. */
export async function loadDailyReportAction(person: string, reportDate: string): Promise<LoadedDailyReport> {
  await requireSiteSession();
  const slug = personSlugSchema.safeParse(person);
  if (!slug.success || !isDateString(reportDate)) return { found: false };
  const report = await getDailyReport(slug.data, reportDate);
  if (!report) return { found: false };
  return {
    found: true,
    title: report.title,
    project: report.project ?? "",
    summary: report.summary,
    done: report.done,
    blockers: report.blockers,
    next: report.next,
  };
}

// -------------------------------------------------------------- decisions --

export async function raiseDecisionAction(formData: FormData): Promise<ActionResult> {
  await requireSiteSession();
  const refused = await refuseCeo();
  if (refused) return refused;
  const input = parseRaiseDecisionForm(formData);
  try {
    await raiseDecision(input, { actor: actorOf(input.person), source: "web" });
    refresh();
    return { ok: true, message: "Decision raised. It now shows under “Needs a decision”." };
  } catch (error) {
    return toFailure(error);
  }
}

export async function answerDecisionAction(formData: FormData): Promise<ActionResult> {
  await requireSiteSession();
  const input = parseAnswerDecisionForm(formData);
  // The CEO always answers as the CEO. Nobody else may use that name.
  const isCeo = (await getRole()) === "ceo";
  if (isCeo) input.person = "ceo";
  else if (input.person === "ceo") return failure({ person: ["Choose who you are"] });
  try {
    await answerDecision(input, { actor: actorOf(input.person), source: "web" });
    refresh();
    return { ok: true, message: "Answer saved. The decision is marked as answered." };
  } catch (error) {
    // If someone else answered first, show them the current state behind the dialog.
    refresh();
    return toFailure(error);
  }
}

// ---------------------------------------------------------- weekly summary --

export async function saveWeeklyReportAction(formData: FormData): Promise<ActionResult> {
  await requireSiteSession();
  const refused = await refuseCeo();
  if (refused) return refused;
  const input = parseWeeklyForm(formData);
  try {
    const { replaced } = await saveWeeklyReport(input, { actor: actorOf(input.person), source: "web" });
    refresh();
    return { ok: true, message: replaced ? "Weekly summary updated." : "Weekly summary saved." };
  } catch (error) {
    return toFailure(error);
  }
}

export type LoadedWeeklyReport =
  | { found: false }
  | {
      found: true;
      oneLine: string;
      results: string[];
      byPerson: Record<"khashayar" | "mahan" | "hossein", string>;
      notFinished: string[];
      label: "green" | "yellow" | "red";
      done: boolean;
    };

/** Used by the weekly form to prefill from the existing summary of a week. */
export async function loadWeeklyReportAction(weekStart: string): Promise<LoadedWeeklyReport> {
  await requireSiteSession();
  if (!isDateString(weekStart) || !isWeekStart(weekStart)) return { found: false };
  const report = await getWeeklyReport(weekStart);
  if (!report) return { found: false };
  return {
    found: true,
    oneLine: report.oneLine,
    results: report.results,
    byPerson: report.byPerson,
    notFinished: report.notFinished,
    label: report.label,
    done: report.done,
  };
}

// ------------------------------------------------------------- CEO review --

/** The CEO marks a report seen and/or leaves a note. Only a visitor signed in with the CEO password may. */
export async function reviewReportAction(formData: FormData): Promise<ActionResult> {
  await requireSiteSession();
  if ((await getRole()) !== "ceo") return failure({}, "Only the CEO can mark reports as seen or leave notes.");
  const input = parseReviewForm(formData);
  try {
    await saveReportReview(input, { actor: "ceo", source: "web" });
    refresh();
    const noteOnly = input.note !== undefined;
    return {
      ok: true,
      message: noteOnly ? (input.note === "" ? "Note removed." : "Note saved.") : input.seen ? "Marked as seen." : "Marked as not seen.",
    };
  } catch (error) {
    return toFailure(error);
  }
}
