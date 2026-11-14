import { describe, expect, it } from "vitest";
import { NO_REPORT_LINE } from "./constants";
import {
  countReportDays,
  decisionAgeDays,
  describeAge,
  fillByPerson,
  findCodeTerms,
  isOpenAsOf,
  isRecentlyAnswered,
  latestPerPerson,
  parseWeekParam,
  reportedDays,
  summariseProgress,
  worseStatus,
} from "./rules";

describe("decisions", () => {
  it("counts age in days and never goes negative", () => {
    expect(decisionAgeDays("2026-11-10", "2026-11-14")).toBe(4);
    expect(decisionAgeDays("2026-11-14", "2026-11-14")).toBe(0);
    expect(decisionAgeDays("2026-11-16", "2026-11-14")).toBe(0);
  });

  it("describes age in plain words", () => {
    expect(describeAge(0)).toBe("Raised today");
    expect(describeAge(1)).toBe("1 day open");
    expect(describeAge(6)).toBe("6 days open");
  });

  it("decides what was open at the end of a day", () => {
    const open = { status: "open", raisedOn: "2026-11-10", answeredOn: null } as const;
    expect(isOpenAsOf(open, "2026-11-09")).toBe(false); // not raised yet
    expect(isOpenAsOf(open, "2026-11-10")).toBe(true);
    expect(isOpenAsOf(open, "2026-12-01")).toBe(true);

    const answered = { status: "answered", raisedOn: "2026-11-10", answeredOn: "2026-11-12" } as const;
    expect(isOpenAsOf(answered, "2026-11-11")).toBe(true); // still waiting back then
    expect(isOpenAsOf(answered, "2026-11-12")).toBe(false);
    expect(isOpenAsOf(answered, "2026-11-20")).toBe(false);
  });

  it("collects recently answered decisions from the last 14 days", () => {
    const d = (answeredOn: string) => ({ status: "answered", raisedOn: "2026-10-01", answeredOn }) as const;
    expect(isRecentlyAnswered(d("2026-11-14"), "2026-11-14")).toBe(true);
    expect(isRecentlyAnswered(d("2026-10-31"), "2026-11-14")).toBe(true);
    expect(isRecentlyAnswered(d("2026-10-30"), "2026-11-14")).toBe(false);
    expect(isRecentlyAnswered(d("2026-11-15"), "2026-11-14")).toBe(false); // answered later
    expect(isRecentlyAnswered({ status: "open", raisedOn: "2026-11-01", answeredOn: null }, "2026-11-14")).toBe(false);
  });
});

describe("week search param", () => {
  it("moves any real date to its Saturday", () => {
    expect(parseWeekParam("2026-11-14")).toBe("2026-11-14");
    expect(parseWeekParam("2026-11-17")).toBe("2026-11-14");
    expect(parseWeekParam("2026-11-20")).toBe("2026-11-14");
  });

  it("ignores junk so the page can show the current week", () => {
    expect(parseWeekParam(undefined)).toBeUndefined();
    expect(parseWeekParam("")).toBeUndefined();
    expect(parseWeekParam("next-week")).toBeUndefined();
    expect(parseWeekParam("2026-02-30")).toBeUndefined();
  });

  it("uses the first value when the param is repeated", () => {
    expect(parseWeekParam(["2026-11-14", "2026-11-07"])).toBe("2026-11-14");
  });
});

describe("plain language check", () => {
  it("passes ordinary business sentences", () => {
    expect(findCodeTerms("The new onboarding flow is live for all customers.")).toEqual([]);
    expect(findCodeTerms("Fixed the payment delay. Support tickets dropped by 20%.")).toEqual([]);
    expect(findCodeTerms("Finished 3 of 4 goals; the 4th waits on a supplier.")).toEqual([]);
  });

  it("flags file names", () => {
    expect(findCodeTerms("Refactored auth.ts to remove a bug")).toEqual(["auth.ts"]);
    expect(findCodeTerms("Updated package.json")).toEqual(["package.json"]);
  });

  it("flags folder paths", () => {
    expect(findCodeTerms("Moved code into src/server")).toContain("src/");
  });

  it("flags code in backticks", () => {
    expect(findCodeTerms("Changed the `retry` setting")).toContain("`code`");
  });
});

describe("by-person lines", () => {
  it("fills missing and blank lines", () => {
    expect(fillByPerson({ mahan: "  Shipped the invoice export  ", hossein: "   " })).toEqual({
      khashayar: NO_REPORT_LINE,
      mahan: "Shipped the invoice export",
      hossein: NO_REPORT_LINE,
    });
  });
});

describe("week numbers", () => {
  const reports = [
    { personSlug: "mahan", reportDate: "2026-11-14", done: ["A", "B"], blockers: [] },
    { personSlug: "mahan", reportDate: "2026-11-15", done: ["b", "C"], blockers: ["Waiting for access"] },
    { personSlug: "hossein", reportDate: "2026-11-14", done: ["D"], blockers: ["Old blocker"] },
    { personSlug: "hossein", reportDate: "2026-11-16", done: [], blockers: [] },
  ] as const;
  const list = reports.map((r) => ({ ...r, done: [...r.done], blockers: [...r.blockers] }));

  it("counts the days each person reported", () => {
    expect(countReportDays(list)).toEqual({ khashayar: 0, mahan: 2, hossein: 2 });
  });

  it("counts a day once even if two reports somehow share it", () => {
    expect(countReportDays([...list, list[0]])).toEqual({ khashayar: 0, mahan: 2, hossein: 2 });
  });

  it("finds each person's newest report", () => {
    const latest = latestPerPerson(list);
    expect(latest.mahan?.reportDate).toBe("2026-11-15");
    expect(latest.hossein?.reportDate).toBe("2026-11-16");
    expect(latest.khashayar).toBeUndefined();
  });

  it("lists which days a person reported", () => {
    expect([...reportedDays(list, "mahan")].sort()).toEqual(["2026-11-14", "2026-11-15"]);
    expect(reportedDays(list, "khashayar").size).toBe(0);
  });

  it("builds the week-in-progress summary from newest to oldest, without repeats", () => {
    const progress = summariseProgress(list);
    expect(progress.reportCount).toBe(4);
    expect(progress.peopleCount).toBe(2);
    expect(progress.doneSoFar).toEqual(["b", "C", "A", "D"]);
    // Only each person's newest report counts for blockers.
    expect(progress.openBlockers).toEqual([{ personSlug: "mahan", text: "Waiting for access" }]);
  });
});

describe("status", () => {
  it("picks the worse of two statuses", () => {
    expect(worseStatus("green", "yellow")).toBe("yellow");
    expect(worseStatus("red", "yellow")).toBe("red");
    expect(worseStatus("green", "green")).toBe("green");
  });
});
