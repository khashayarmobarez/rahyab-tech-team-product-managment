/**
 * The Thursday email for the CEO, written as plain text and simple HTML.
 * Pure: it gets the data and returns the words. Sending lives in the route.
 */
import { PERSON_SLUGS, STATUS_COPY, type PersonSlug, type StatusLabel } from "./constants";
import { formatDay, formatWeekLabel } from "./dates";
import { decisionAgeDays, summariseProgress, type StuckBlocker } from "./rules";

export type DigestInput = {
  weekStart: string;
  today: string;
  siteUrl: string;
  names: Record<PersonSlug, string>;
  /** The weekly summary, if one was written. */
  weekly: { oneLine: string; label: StatusLabel; results: string[]; notFinished: string[]; final: boolean } | null;
  /** The week's daily reports. */
  reports: { personSlug: PersonSlug; reportDate: string; title: string; done: string[]; blockers: string[] }[];
  openDecisions: { title: string; raisedOn: string }[];
  stuck: StuckBlocker[];
};

export type Digest = { subject: string; text: string; html: string };

const MAX_TOPIC_LINES = 14;
const MAX_DONE = 8;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Block = { heading: string; lines: string[]; empty?: string };

export function buildDigest(input: DigestInput): Digest {
  const { weekStart, today, names, weekly, reports, openDecisions, stuck, siteUrl } = input;
  const progress = summariseProgress(reports);
  const blocks: Block[] = [];

  // Topics, day by day, oldest first so the week reads in order.
  const byDay = new Map<string, string[]>();
  for (const r of [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate))) {
    const list = byDay.get(r.reportDate) ?? [];
    list.push(`${names[r.personSlug]}: ${r.title}${r.blockers.length > 0 ? " (has a blocker)" : ""}`);
    byDay.set(r.reportDate, list);
  }
  const topicLines = [...byDay.entries()].flatMap(([date, items]) => [`${formatDay(date)}`, ...items.map((i) => `  ${i}`)]);

  if (weekly) {
    blocks.push({
      heading: `Weekly summary (${STATUS_COPY[weekly.label].name}${weekly.final ? "" : ", draft"})`,
      lines: [weekly.oneLine, ...weekly.results.map((r) => `Done: ${r}`), ...weekly.notFinished.map((n) => `Not finished: ${n}`)],
    });
  } else {
    blocks.push({
      heading: "Weekly summary",
      lines: ["Not written yet. Below is built from the daily reports."],
    });
    if (progress.doneSoFar.length > 0) {
      blocks.push({
        heading: "Done so far",
        lines: [
          ...progress.doneSoFar.slice(0, MAX_DONE),
          ...(progress.doneSoFar.length > MAX_DONE ? [`and ${progress.doneSoFar.length - MAX_DONE} more`] : []),
        ],
      });
    }
  }

  const attention = [
    ...stuck.map((s) => `${names[s.personSlug]} has been blocked for ${s.days} days: ${s.text}`),
    ...openDecisions
      .map((d) => ({ d, days: decisionAgeDays(d.raisedOn, today) }))
      .filter((x) => x.days > 2)
      .map((x) => `Decision waiting ${x.days} days: ${x.d.title}`),
  ];
  blocks.push({ heading: "Needs attention", lines: attention, empty: "Nothing." });

  blocks.push({
    heading: `Waiting for a decision (${openDecisions.length})`,
    lines: openDecisions.map((d) => `${d.title} (${decisionAgeDays(d.raisedOn, today)} days)`),
    empty: "Nothing is waiting for a decision.",
  });

  const shownTopics = topicLines.slice(0, MAX_TOPIC_LINES);
  if (topicLines.length > MAX_TOPIC_LINES) {
    shownTopics.push(`and ${topicLines.length - MAX_TOPIC_LINES} more lines on the site`);
  }
  blocks.push({ heading: "What we worked on", lines: shownTopics, empty: "No daily reports this week." });

  const daysReported = PERSON_SLUGS.map((slug) => {
    const days = new Set(reports.filter((r) => r.personSlug === slug).map((r) => r.reportDate)).size;
    return `${names[slug]} ${days} ${days === 1 ? "day" : "days"}`;
  }).join(" · ");
  blocks.push({ heading: "Days with a report", lines: [daysReported] });

  const subject = `Team Reports: ${formatWeekLabel(weekStart)}`;
  const text =
    [
      subject,
      "",
      ...blocks.flatMap((b) => [b.heading.toUpperCase(), ...(b.lines.length > 0 ? b.lines : [b.empty ?? ""]), ""]),
      `Open the site: ${siteUrl}`,
    ].join("\n") + "\n";

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f4;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:12px;padding:24px;">
<h1 style="font-size:22px;margin:0 0 16px;">${escapeHtml(subject)}</h1>
${blocks
  .map(
    (b) =>
      `<h2 style="font-size:17px;margin:20px 0 6px;">${escapeHtml(b.heading)}</h2>` +
      (b.lines.length > 0
        ? `<div style="font-size:16px;line-height:1.5;">${b.lines.map((l) => `<div style="${l.startsWith("  ") ? "padding-left:16px;" : ""}">${escapeHtml(l.trim())}</div>`).join("")}</div>`
        : `<p style="font-size:16px;margin:0;color:#555;">${escapeHtml(b.empty ?? "")}</p>`),
  )
  .join("\n")}
<p style="margin:24px 0 0;font-size:16px;"><a href="${escapeHtml(siteUrl)}">Open Team Reports</a></p>
</div></body></html>`;

  return { subject, text, html };
}
