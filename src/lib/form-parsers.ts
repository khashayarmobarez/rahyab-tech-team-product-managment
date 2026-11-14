/**
 * Turns FormData into the plain objects the shared zod schemas expect. No
 * checking happens here: the schemas do that, so the web form and the MCP server
 * follow identical rules. List fields are sent as repeated entries.
 *
 * The casts below are the one place a form's raw strings are treated as typed
 * input. That is safe because every service function validates its input
 * again with zod before it uses it.
 */
import type {
  AnswerDecisionInput,
  CreateTokenInput,
  DailyReportInput,
  RaiseDecisionInput,
  UpdatePersonInput,
  WeeklyReportInput,
} from "./schemas";

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function list(form: FormData, name: string): string[] {
  return form.getAll(name).filter((v): v is string => typeof v === "string");
}

export function parseDailyForm(form: FormData): DailyReportInput {
  return {
    person: text(form, "person") as DailyReportInput["person"],
    reportDate: text(form, "reportDate"),
    title: text(form, "title"),
    summary: text(form, "summary"),
    done: list(form, "done"),
    blockers: list(form, "blockers"),
    next: list(form, "next"),
  };
}

export function parseRaiseDecisionForm(form: FormData): RaiseDecisionInput {
  return {
    person: text(form, "person") as RaiseDecisionInput["person"],
    title: text(form, "title"),
    description: text(form, "description"),
  };
}

export function parseAnswerDecisionForm(form: FormData): AnswerDecisionInput {
  return {
    person: text(form, "person") as AnswerDecisionInput["person"],
    decisionId: text(form, "decisionId"),
    answer: text(form, "answer"),
  };
}

export function parseWeeklyForm(form: FormData): WeeklyReportInput {
  return {
    person: text(form, "person") as WeeklyReportInput["person"],
    weekStart: text(form, "weekStart"),
    oneLine: text(form, "oneLine"),
    results: list(form, "results"),
    byPerson: {
      khashayar: text(form, "byPerson.khashayar"),
      mahan: text(form, "byPerson.mahan"),
      hossein: text(form, "byPerson.hossein"),
    },
    notFinished: list(form, "notFinished"),
    label: text(form, "label") as WeeklyReportInput["label"],
    done: form.get("done") === "on",
  };
}

export function parseUpdatePersonForm(form: FormData): UpdatePersonInput {
  return {
    slug: text(form, "slug") as UpdatePersonInput["slug"],
    name: text(form, "name"),
    active: form.get("active") === "on",
  };
}

export function parseCreateTokenForm(form: FormData): CreateTokenInput {
  return {
    owner: text(form, "owner") as CreateTokenInput["owner"],
    name: text(form, "name"),
    scopes: list(form, "scopes") as CreateTokenInput["scopes"],
  };
}
