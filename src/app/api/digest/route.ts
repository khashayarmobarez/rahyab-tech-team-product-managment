import { createHash, timingSafeEqual } from "node:crypto";
import { bearerToken } from "@/lib/agent-access";
import { buildDigest } from "@/lib/digest";
import { addDays, todayInTehran, weekStartOf } from "@/lib/dates";
import { stuckBlockers } from "@/lib/rules";
import { PERSON_SLUGS, type PersonSlug } from "@/lib/constants";
import { siteOrigin } from "@/server/origin";
import {
  getWeeklyReport,
  listDailyReports,
  listDailyReportsForWeek,
  listDecisionsForWeek,
  listPeople,
} from "@/server/reports";

/**
 * GET /api/digest: builds the weekly email for the CEO and sends it.
 *
 * It is meant for a scheduler (vercel.json runs it on Thursday evening, Tehran
 * time). It needs `Authorization: Bearer <CRON_SECRET>`; Vercel adds that header
 * itself when CRON_SECRET is set. Add `?dry=1` to see the email without sending it.
 * Sending uses Resend (RESEND_API_KEY, DIGEST_FROM, DIGEST_TO). Without those
 * settings the route says what is missing and sends nothing.
 */

function sameSecret(typed: string, expected: string): boolean {
  const a = createHash("sha256").update(typed).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET is not set, so the digest is switched off." }, 503);
  const token = bearerToken(request.headers.get("authorization"));
  if (!token || !sameSecret(token, secret)) return json({ error: "Not allowed." }, 401);

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const today = todayInTehran();
  const weekStart = weekStartOf(today);

  try {
    const [people, reports, weekly, decisionView, recent] = await Promise.all([
      listPeople(),
      listDailyReportsForWeek(weekStart),
      getWeeklyReport(weekStart),
      listDecisionsForWeek(weekStart, today),
      listDailyReports({ from: addDays(today, -13), to: today, limit: 200 }),
    ]);
    const names = Object.fromEntries(
      PERSON_SLUGS.map((slug) => [slug, people.find((p) => p.slug === slug)?.name ?? slug]),
    ) as Record<PersonSlug, string>;
    const digest = buildDigest({
      weekStart,
      today,
      siteUrl: await siteOrigin(),
      names,
      weekly: weekly
        ? { oneLine: weekly.oneLine, label: weekly.label, results: weekly.results, notFinished: weekly.notFinished, final: weekly.done }
        : null,
      reports,
      openDecisions: decisionView.open,
      stuck: stuckBlockers(recent),
    });

    if (dry) return json({ dryRun: true, subject: digest.subject, text: digest.text });

    const key = process.env.RESEND_API_KEY;
    const from = process.env.DIGEST_FROM;
    const to = (process.env.DIGEST_TO ?? "")
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);
    const missing = [!key && "RESEND_API_KEY", !from && "DIGEST_FROM", to.length === 0 && "DIGEST_TO"].filter(Boolean);
    if (missing.length > 0) return json({ error: `Not sent. Missing settings: ${missing.join(", ")}.` }, 503);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: digest.subject, text: digest.text, html: digest.html }),
    });
    if (!response.ok) {
      console.error("Digest email was refused:", response.status, await response.text());
      return json({ error: "The email service refused the message. Check RESEND_API_KEY and DIGEST_FROM." }, 502);
    }
    return json({ sent: true, to: to.length, subject: digest.subject });
  } catch (error) {
    console.error("Digest failed:", error);
    return json({ error: "The digest could not be built. Check the server log." }, 500);
  }
}
