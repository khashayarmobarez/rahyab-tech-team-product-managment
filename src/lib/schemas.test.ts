import { describe, expect, it } from "vitest";
import { NO_REPORT_LINE } from "./constants";
import {
  ValidationError,
  answerDecisionSchema,
  createTokenSchema,
  dailyReportInputSchema,
  fieldErrorsOf,
  raiseDecisionSchema,
  toFieldErrors,
  weeklyReportInputSchema,
} from "./schemas";

const validDaily = {
  person: "mahan",
  reportDate: "2026-11-14",
  title: "Invoice export",
  summary: "Finished the export and tested it with real data.",
  done: ["Export finished"],
  blockers: [],
  next: ["Share with finance"],
};

describe("daily report", () => {
  it("accepts a good report", () => {
    expect(dailyReportInputSchema.safeParse(validDaily).success).toBe(true);
  });

  it("drops blank list rows and trims text", () => {
    const result = dailyReportInputSchema.parse({
      ...validDaily,
      title: "  Invoice export  ",
      done: ["  Export finished ", "", "   "],
    });
    expect(result.title).toBe("Invoice export");
    expect(result.done).toEqual(["Export finished"]);
  });

  it("allows empty lists", () => {
    expect(dailyReportInputSchema.safeParse({ ...validDaily, done: [], blockers: [], next: [] }).success).toBe(true);
  });

  it("explains each missing field in the form's own words", () => {
    const result = dailyReportInputSchema.safeParse({ ...validDaily, person: "", title: " ", summary: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = toFieldErrors(result.error);
    expect(errors.person).toEqual(["Choose who you are"]);
    expect(errors.title).toEqual(["Title is required"]);
    expect(errors.summary).toEqual(["Summary is required"]);
  });

  it("rejects an unknown person and a date that is not real", () => {
    const errors = toFieldErrors(
      dailyReportInputSchema.safeParse({ ...validDaily, person: "someone", reportDate: "2026-02-30" }).error!,
    );
    expect(errors.person).toBeDefined();
    expect(errors.reportDate).toEqual(["Date must be a real date like 2026-11-14"]);
  });

  it("limits the length of the title and of list lines", () => {
    const errors = toFieldErrors(
      dailyReportInputSchema.safeParse({ ...validDaily, title: "x".repeat(121), done: ["y".repeat(401)] }).error!,
    );
    expect(errors.title?.[0]).toContain("120");
    expect(errors["done.0"]?.[0]).toContain("400");
  });
});

describe("decisions", () => {
  it("needs a title and a description", () => {
    const errors = toFieldErrors(raiseDecisionSchema.safeParse({ person: "mahan", title: "", description: "" }).error!);
    expect(errors.title).toBeDefined();
    expect(errors.description).toBeDefined();
  });

  it("needs a real decision id and an answer", () => {
    const bad = answerDecisionSchema.safeParse({ person: "mahan", decisionId: "nope", answer: " " });
    expect(bad.success).toBe(false);
    const good = answerDecisionSchema.safeParse({
      person: "mahan",
      decisionId: "6f1c1f3e-8d7a-4a53-9c3b-0f4b2f6d9a10",
      answer: "Go ahead.",
    });
    expect(good.success).toBe(true);
  });
});

const validWeekly = {
  person: "khashayar",
  weekStart: "2026-11-14",
  oneLine: "Customers can now pay invoices online.",
  results: ["Online payments are live", "Support tickets dropped by a fifth"],
  byPerson: { khashayar: "Led the launch", mahan: "", hossein: "Fixed the slow reports" },
  notFinished: ["Refund screen"],
  label: "green",
  done: false,
};

describe("weekly report", () => {
  it("accepts a good summary and fills empty person lines", () => {
    const result = weeklyReportInputSchema.parse(validWeekly);
    expect(result.byPerson.mahan).toBe(NO_REPORT_LINE);
    expect(result.byPerson.khashayar).toBe("Led the launch");
  });

  it("fills person lines that were left out entirely", () => {
    const result = weeklyReportInputSchema.parse({ ...validWeekly, byPerson: {} });
    expect(result.byPerson).toEqual({
      khashayar: NO_REPORT_LINE,
      mahan: NO_REPORT_LINE,
      hossein: NO_REPORT_LINE,
    });
  });

  it("needs 1 to 5 results", () => {
    const none = toFieldErrors(weeklyReportInputSchema.safeParse({ ...validWeekly, results: ["", " "] }).error!);
    expect(none.results?.[0]).toBe("Add at least one line to results");
    const six = toFieldErrors(
      weeklyReportInputSchema.safeParse({ ...validWeekly, results: ["a", "b", "c", "d", "e", "f"] }).error!,
    );
    expect(six.results?.[0]).toBe("Results can have at most 5 lines");
    expect(weeklyReportInputSchema.safeParse({ ...validWeekly, results: ["a", "b", "c", "d", "e"] }).success).toBe(true);
  });

  it("needs a Saturday as the week start", () => {
    const errors = toFieldErrors(weeklyReportInputSchema.safeParse({ ...validWeekly, weekStart: "2026-11-15" }).error!);
    expect(errors.weekStart).toEqual(["Pick a week that starts on a Saturday"]);
  });

  it("needs a status", () => {
    const errors = toFieldErrors(weeklyReportInputSchema.safeParse({ ...validWeekly, label: "blue" }).error!);
    expect(errors.label).toEqual(["Pick a status"]);
  });

  it("refuses file names and code terms in text the CEO reads", () => {
    const errors = toFieldErrors(
      weeklyReportInputSchema.safeParse({
        ...validWeekly,
        oneLine: "Rewrote billing.ts",
        results: ["Online payments are live", "Cleaned `invoice` code"],
        byPerson: { ...validWeekly.byPerson, mahan: "Edited src/server" },
        notFinished: ["Update package.json"],
      }).error!,
    );
    expect(errors.oneLine?.[0]).toContain("billing.ts");
    expect(errors["results.1"]?.[0]).toContain("plain business words");
    expect(errors["byPerson.mahan"]).toBeDefined();
    expect(errors["notFinished.0"]).toBeDefined();
  });

  it("does not flag the standard 'no report' line", () => {
    expect(weeklyReportInputSchema.safeParse({ ...validWeekly, byPerson: { khashayar: NO_REPORT_LINE } }).success).toBe(true);
  });
});

describe("admin", () => {
  it("needs a permission and a name for a token", () => {
    const errors = toFieldErrors(createTokenSchema.safeParse({ owner: "team", name: "", scopes: [] }).error!);
    expect(errors.name).toBeDefined();
    expect(errors.scopes).toEqual(["Choose at least one permission"]);
  });

  it("accepts a team token", () => {
    expect(createTokenSchema.safeParse({ owner: "team", name: "Assistant", scopes: ["reports:read"] }).success).toBe(true);
  });
});

describe("field errors", () => {
  it("reads both kinds of error", () => {
    const zodError = dailyReportInputSchema.safeParse({}).error!;
    expect(fieldErrorsOf(zodError)?.title).toBeDefined();
    expect(fieldErrorsOf(new ValidationError({ reportDate: ["Too early"] }))).toEqual({ reportDate: ["Too early"] });
    expect(fieldErrorsOf(new Error("boom"))).toBeUndefined();
  });
});
