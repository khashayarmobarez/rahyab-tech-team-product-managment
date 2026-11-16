import Link from "next/link";
import { AlertTriangleIcon, ClockIcon } from "lucide-react";
import type { PersonSlug } from "@/lib/constants";
import { formatDay } from "@/lib/dates";
import { decisionAgeDays, type StuckBlocker } from "@/lib/rules";
import type { Decision } from "@/server/reports";

/** A decision open longer than this many days is flagged. */
export const DECISION_ALERT_DAYS = 2;

const MAX_ITEMS = 5;

/**
 * Things the CEO should not have to hunt for: a blocker that keeps coming back
 * in someone's reports, and decisions that have waited more than two days.
 * Draws nothing when all is calm. Not a status colour: an icon and words.
 */
export function AttentionBanner({
  stuck,
  openDecisions,
  asOf,
  names,
}: {
  stuck: StuckBlocker[];
  openDecisions: Decision[];
  asOf: string;
  names: Record<PersonSlug, string>;
}) {
  const waiting = openDecisions
    .map((d) => ({ decision: d, days: decisionAgeDays(d.raisedOn, asOf) }))
    .filter((d) => d.days > DECISION_ALERT_DAYS)
    .sort((a, b) => b.days - a.days);
  const total = stuck.length + waiting.length;
  if (total === 0) return null;

  return (
    <section aria-labelledby="attention-title" className="grid gap-3 rounded-2xl border-2 border-foreground/70 bg-card p-4 shadow-sm print:hidden">
      <h2 id="attention-title" className="flex items-center gap-2 text-xl font-semibold">
        <AlertTriangleIcon aria-hidden className="size-5" />
        Needs attention ({total})
      </h2>
      <ul className="grid gap-2">
        {stuck.slice(0, MAX_ITEMS).map((item) => (
          <li key={`${item.personSlug}-${item.text}`} className="flex items-start gap-2">
            <AlertTriangleIcon aria-hidden className="mt-1 size-4 shrink-0" />
            <span>
              <strong>
                {names[item.personSlug]} has been blocked for {item.days} days
              </strong>{" "}
              (since {formatDay(item.since)}): {item.text}
            </span>
          </li>
        ))}
        {waiting.slice(0, Math.max(0, MAX_ITEMS - stuck.length)).map(({ decision, days }) => (
          <li key={decision.id} className="flex items-start gap-2">
            <ClockIcon aria-hidden className="mt-1 size-4 shrink-0" />
            <span>
              <strong>A decision has waited {days} days:</strong> {decision.title}{" "}
              <Link href="#decisions" className="font-medium text-primary underline underline-offset-4">
                Open decisions
              </Link>
            </span>
          </li>
        ))}
      </ul>
      {total > MAX_ITEMS ? <p className="text-muted-foreground">and {total - MAX_ITEMS} more.</p> : null}
    </section>
  );
}
