/**
 * Validation for every write, shared by the web forms and (later) the MCP
 * server. Messages are written for the person filling in the form.
 */
import { z } from "zod";
import {
  NO_REPORT_LINE,
  PERSON_SLUGS,
  STATUS_LABELS,
  TOKEN_OWNERS,
  TOKEN_SCOPES,
} from "./constants";
import { isDateString, isWeekStart } from "./dates";
import { findCodeTerms } from "./rules";

// ------------------------------------------------------------------ building blocks --

export const personSlugSchema = z.enum(PERSON_SLUGS, { error: "Choose who you are" });

const dateField = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .refine(isDateString, `${label} must be a real date like 2026-11-14`);

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

/** A list of lines. Blank rows are dropped, so an empty row never causes an error. */
const lines = (label: string, options: { max: number; min?: number; itemMax?: number }) => {
  const { max, min = 0, itemMax = 400 } = options;
  return z
    .array(z.string({ error: `${label}: each line must be text` }).trim(), {
      error: `${label} must be a list`,
    })
    .transform((items) => items.filter((item) => item !== ""))
    .pipe(
      z
        .array(z.string().max(itemMax, `Each line in ${label.toLowerCase()} must be ${itemMax} characters or fewer`))
        .min(min, min === 1 ? `Add at least one line to ${label.toLowerCase()}` : `Add at least ${min} lines to ${label.toLowerCase()}`)
        .max(max, `${label} can have at most ${max} lines`),
    );
};

/** Refinement: reject file names and code terms in text the CEO will read. */
const plainLanguage = (text: string, context: z.RefinementCtx) => {
  if (text === NO_REPORT_LINE) return;
  const terms = findCodeTerms(text);
  if (terms.length > 0) {
    context.addIssue({
      code: "custom",
      message: `Say this in plain business words. Remove "${terms[0]}" (no file names or code terms).`,
    });
  }
};

// ------------------------------------------------------------------ daily report --

export const dailyReportInputSchema = z.object({
  person: personSlugSchema,
  reportDate: dateField("Date"),
  title: requiredText("Title", 120),
  summary: requiredText("Summary", 2000),
  done: lines("Done", { max: 20 }),
  blockers: lines("Blockers", { max: 20 }),
  next: lines("Next", { max: 20 }),
});
export type DailyReportInput = z.input<typeof dailyReportInputSchema>;
export type DailyReportData = z.output<typeof dailyReportInputSchema>;

// ------------------------------------------------------------------ decisions --

export const raiseDecisionSchema = z.object({
  person: personSlugSchema,
  title: requiredText("Title", 140),
  description: requiredText("Description", 2000),
});
export type RaiseDecisionInput = z.input<typeof raiseDecisionSchema>;

export const answerDecisionSchema = z.object({
  person: personSlugSchema,
  decisionId: z.uuid({ error: "Pick a decision to answer" }),
  answer: requiredText("Answer", 2000),
});
export type AnswerDecisionInput = z.input<typeof answerDecisionSchema>;

// ------------------------------------------------------------------ weekly report --

const plainText = (label: string, max: number) => requiredText(label, max).superRefine(plainLanguage);

const byPersonLine = z
  .string()
  .trim()
  .max(300, "Each person's line must be 300 characters or fewer")
  .optional()
  .transform((value) => (value ? value : NO_REPORT_LINE))
  .superRefine(plainLanguage);

export const weeklyReportInputSchema = z.object({
  person: personSlugSchema,
  weekStart: dateField("Week").refine(isWeekStart, "Pick a week that starts on a Saturday"),
  oneLine: plainText("One-line result", 200),
  results: lines("Results", { min: 1, max: 5, itemMax: 300 }).pipe(
    z.array(z.string().superRefine(plainLanguage)),
  ),
  byPerson: z.object({
    khashayar: byPersonLine,
    mahan: byPersonLine,
    hossein: byPersonLine,
  }),
  notFinished: lines("Not finished", { max: 10, itemMax: 300 }).pipe(
    z.array(z.string().superRefine(plainLanguage)),
  ),
  label: z.enum(STATUS_LABELS, { error: "Pick a status" }),
  done: z.boolean({ error: "Say whether this summary is final" }),
});
export type WeeklyReportInput = z.input<typeof weeklyReportInputSchema>;
export type WeeklyReportData = z.output<typeof weeklyReportInputSchema>;

// ------------------------------------------------------------------ admin --

export const updatePersonSchema = z.object({
  slug: z.enum(PERSON_SLUGS, { error: "Unknown person" }),
  name: requiredText("Name", 60),
  active: z.boolean(),
});
export type UpdatePersonInput = z.input<typeof updatePersonSchema>;

export const createTokenSchema = z.object({
  owner: z.enum(TOKEN_OWNERS, { error: "Choose who the token belongs to" }),
  name: requiredText("Name", 60),
  scopes: z
    .array(z.enum(TOKEN_SCOPES, { error: "Unknown permission" }), { error: "Choose at least one permission" })
    .min(1, "Choose at least one permission"),
});
export type CreateTokenInput = z.input<typeof createTokenSchema>;

// ------------------------------------------------------------------ errors --

/** Field name -> messages. The key "_form" holds errors that belong to no field. */
export type FieldErrors = Record<string, string[]>;

/** A rule broken after validation (a date in the future, a decision already answered...). */
export class ValidationError extends Error {
  readonly fieldErrors: FieldErrors;
  constructor(fieldErrors: FieldErrors) {
    super(Object.values(fieldErrors).flat()[0] ?? "Invalid input");
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/** Turns a zod error into field errors keyed by path, like "done.2" or "byPerson.mahan". */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

/** Same for either kind of error. Returns undefined for anything else. */
export function fieldErrorsOf(error: unknown): FieldErrors | undefined {
  if (error instanceof z.ZodError) return toFieldErrors(error);
  if (error instanceof ValidationError) return error.fieldErrors;
  return undefined;
}
