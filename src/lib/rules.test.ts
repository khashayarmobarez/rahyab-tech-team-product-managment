import { describe, expect, it } from "vitest";
import { NO_REPORT_LINE } from "./constants";
import {
  countReportDays,
  dayCounts,
  decisionAgeDays,
  describeAge,
  fillByPerson,
  filterReports,
  findCodeTerms,
  groupByDay,
  isOpenAsOf,
  isRecentlyAnswered,
  latestPerPerson,
  parseDayParam,
  parseFlagParam,
  parsePersonParam,
  parseQueryParam,
  parseViewParam,
  parseWeekParam,
  projectTotals,
  stuckBlockers,
  reportedDays,
  summariseProgress,
  worseStatus,
  workHref,
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

describe("what we worked on: choices in the address", () => {
  const week = "2026-11-14"; // Saturday

  it("accepts only a day inside the shown week", () => {
    expect(parseDayParam("2026-11-16", week)).toBe("2026-11-16");
    expect(parseDayParam("2026-11-13", week)).toBeUndefined(); // the week before
    expect(parseDayParam("2026-11-21", week)).toBeUndefined(); // the week after
    expect(parseDayParam("tomorrow", week)).toBeUndefined();
    expect(parseDayParam(undefined, week)).toBeUndefined();
  });

  it("accepts only the three people and the flag 1", () => {
    expect(parsePersonParam("mahan")).toBe("mahan");
    expect(parsePersonParam("nobody")).toBeUndefined();
    expect(parseFlagParam("1")).toBe(true);
    expect(parseFlagParam("yes")).toBe(false);
    expect(parseFlagParam(undefined)).toBe(false);
  });

  it("builds short links and leaves the defaults out", () => {
    expect(workHref({ week, currentWeek: week })).toBe("/");
    expect(workHref({ week, currentWeek: week, day: "2026-11-16", anchor: "work" })).toBe("/?day=2026-11-16#work");
    expect(workHref({ week: "2026-11-07", currentWeek: week, person: "hossein", blockersOnly: true })).toBe(
      "/?week=2026-11-07&person=hossein&blockers=1",
    );
  });
});

describe("what we worked on: filtering and grouping", () => {
  const reports = [
    { personSlug: "khashayar" as const, reportDate: "2026-11-16", blockers: [] as string[] },
    { personSlug: "mahan" as const, reportDate: "2026-11-16", blockers: ["Waiting for the server"] },
    { personSlug: "khashayar" as const, reportDate: "2026-11-15", blockers: [] as string[] },
    { personSlug: "hossein" as const, reportDate: "2026-11-14", blockers: ["No test data"] },
  ];

  it("keeps everything when no choice is made", () => {
    expect(filterReports(reports, { blockersOnly: false })).toHaveLength(4);
  });

  it("combines day, person and blockers", () => {
    expect(filterReports(reports, { day: "2026-11-16", blockersOnly: false })).toHaveLength(2);
    expect(filterReports(reports, { person: "khashayar", blockersOnly: false })).toHaveLength(2);
    expect(filterReports(reports, { blockersOnly: true }).map((r) => r.personSlug)).toEqual(["mahan", "hossein"]);
    expect(filterReports(reports, { day: "2026-11-16", person: "mahan", blockersOnly: true })).toHaveLength(1);
    expect(filterReports(reports, { day: "2026-11-15", blockersOnly: true })).toHaveLength(0);
  });

  it("groups under the day, newest day first", () => {
    const groups = groupByDay([...reports].reverse());
    expect(groups.map((g) => g.date)).toEqual(["2026-11-16", "2026-11-15", "2026-11-14"]);
    expect(groups[0].reports).toHaveLength(2);
  });

  it("counts reports per person for each day, including empty days", () => {
    const counts = dayCounts(reports, ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]);
    expect(counts.map((c) => c.total)).toEqual([1, 1, 2, 0]);
    expect(counts[2].byPerson).toEqual({ khashayar: 1, mahan: 1, hossein: 0 });
  });
});

describe("search, view and links", () => {
  it("tidies the search words and ignores very short ones", () => {
    expect(parseQueryParam("  online   invoice ")).toBe("online invoice");
    expect(parseQueryParam("a")).toBeUndefined();
    expect(parseQueryParam("")).toBeUndefined();
    expect(parseQueryParam(undefined)).toBeUndefined();
    expect(parseQueryParam("x".repeat(200))).toHaveLength(80);
  });

  it("defaults to cards and accepts list", () => {
    expect(parseViewParam(undefined)).toBe("cards");
    expect(parseViewParam("nonsense")).toBe("cards");
    expect(parseViewParam("list")).toBe("list");
  });

  it("a search link carries no week or day, and the list view is kept", () => {
    expect(
      workHref({ week: "2026-11-07", currentWeek: "2026-11-14", day: "2026-11-09", query: "invoice", view: "list", anchor: "work" }),
    ).toBe("/?q=invoice&view=list#work");
  });
});

describe("projects", () => {
  const r = (personSlug: "khashayar" | "mahan" | "hossein", project: string | null) => ({
    personSlug,
    reportDate: "2026-11-14",
    project,
  });

  it("counts reports per project ignoring case, biggest first, untagged last", () => {
    const totals = projectTotals([
      r("khashayar", "Payments"),
      r("mahan", "payments"),
      r("hossein", "Speed"),
      r("hossein", null),
      r("mahan", "  "),
    ]);
    expect(totals.map((t) => [t.name, t.reports])).toEqual([
      ["Payments", 2],
      ["Speed", 1],
      ["No project", 2],
    ]);
    expect(totals[0].people).toEqual(["khashayar", "mahan"]);
    expect(totals[2].tagged).toBe(false);
  });

  it("gives an empty list for no reports", () => {
    expect(projectTotals([])).toEqual([]);
  });
});

describe("stuck blockers", () => {
  const rep = (reportDate: string, blockers: string[], personSlug: "khashayar" | "mahan" = "khashayar") => ({
    personSlug,
    reportDate,
    blockers,
  });

  it("finds a blocker repeated on three days and still in the newest report", () => {
    const found = stuckBlockers([
      rep("2026-11-16", ["Waiting for the server"]),
      rep("2026-11-15", ["waiting  for the server", "Other"]),
      rep("2026-11-14", ["Waiting for the server"]),
    ]);
    expect(found).toEqual([{ personSlug: "khashayar", text: "Waiting for the server", days: 3, since: "2026-11-14" }]);
  });

  it("ignores blockers that are resolved or too new", () => {
    expect(
      stuckBlockers([rep("2026-11-16", []), rep("2026-11-15", ["Waiting"]), rep("2026-11-14", ["Waiting"])]),
    ).toEqual([]);
    expect(stuckBlockers([rep("2026-11-16", ["Waiting"]), rep("2026-11-15", ["Waiting"])])).toEqual([]);
  });

  it("keeps people apart", () => {
    expect(
      stuckBlockers([
        rep("2026-11-16", ["Waiting"], "khashayar"),
        rep("2026-11-15", ["Waiting"], "mahan"),
        rep("2026-11-14", ["Waiting"], "khashayar"),
      ]),
    ).toEqual([]);
  });
});
