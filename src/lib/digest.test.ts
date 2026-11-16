import { describe, expect, it } from "vitest";
import { buildDigest, type DigestInput } from "./digest";

const names = { khashayar: "Khashayar", mahan: "Mahan", hossein: "Hossein" };

const base: DigestInput = {
  weekStart: "2026-11-14",
  today: "2026-11-19",
  siteUrl: "https://reports.example.com",
  names,
  weekly: null,
  reports: [
    { personSlug: "khashayar", reportDate: "2026-11-14", title: "Online payments", done: ["Payment flow works"], blockers: [] },
    { personSlug: "mahan", reportDate: "2026-11-15", title: "Reporting <screens>", done: ["First version"], blockers: ["Waiting for finance"] },
  ],
  openDecisions: [
    { title: "Approve a second test copy", raisedOn: "2026-11-14" },
    { title: "Fresh question", raisedOn: "2026-11-19" },
  ],
  stuck: [{ personSlug: "mahan", text: "Waiting for finance", days: 3, since: "2026-11-15" }],
};

describe("weekly digest", () => {
  it("names the week and lists topics in order", () => {
    const { subject, text } = buildDigest(base);
    expect(subject).toBe("Team Reports: Sat 14 Nov – Thu 19 Nov 2026");
    expect(text.indexOf("Online payments")).toBeLessThan(text.indexOf("Reporting <screens>"));
    expect(text).toContain("Mahan: Reporting <screens> (has a blocker)");
    expect(text).toContain("Khashayar 1 day · Mahan 1 day · Hossein 0 days");
    expect(text).toContain("Open the site: https://reports.example.com");
  });

  it("flags stuck blockers and decisions waiting more than two days, not fresh ones", () => {
    const { text } = buildDigest(base);
    expect(text).toContain("Mahan has been blocked for 3 days: Waiting for finance");
    expect(text).toContain("Decision waiting 5 days: Approve a second test copy");
    expect(text).not.toContain("Decision waiting 0 days");
  });

  it("uses the weekly summary when there is one, and says when it is a draft", () => {
    const { text } = buildDigest({
      ...base,
      weekly: { oneLine: "Payments are ready to test", label: "yellow", results: ["Payment flow"], notFinished: ["Refunds"], final: false },
    });
    expect(text).toContain("WEEKLY SUMMARY (NEEDS ATTENTION, DRAFT)");
    expect(text).toContain("Payments are ready to test");
    expect(text).toContain("Not finished: Refunds");
  });

  it("says plainly when there is nothing to report, and escapes the HTML", () => {
    const quiet = buildDigest({ ...base, reports: [], openDecisions: [], stuck: [] });
    expect(quiet.text).toContain("No daily reports this week.");
    expect(quiet.text).toContain("Nothing is waiting for a decision.");
    expect(buildDigest(base).html).toContain("Reporting &lt;screens&gt;");
  });
});
