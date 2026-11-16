export const PERSON_SLUGS = ["khashayar", "mahan", "hossein"] as const;
export type PersonSlug = (typeof PERSON_SLUGS)[number];

/** Who is looking at the site. The CEO sees everything, answers decisions and reviews reports; the team writes them. */
export type Role = "team" | "ceo";

export const STATUS_LABELS = ["green", "yellow", "red"] as const;
export type StatusLabel = (typeof STATUS_LABELS)[number];

/** Chart colour of each person (Tailwind class parts: bg-series-N). The order never changes. */
export const PERSON_SERIES: Record<PersonSlug, 1 | 2 | 3> = { khashayar: 1, mahan: 2, hossein: 3 };

export const DECISION_STATUSES = ["open", "answered"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const AUDIT_SOURCES = ["web", "mcp"] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export const TOKEN_OWNERS = [...PERSON_SLUGS, "team"] as const;
export type TokenOwner = (typeof TOKEN_OWNERS)[number];

export const TOKEN_SCOPES = [
  "reports:read",
  "reports:write",
  "decisions:write",
  "decisions:answer",
  "weekly:write",
] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const TOKEN_SCOPE_LABELS: Record<TokenScope, string> = {
  "reports:read": "Read reports, summaries and decisions",
  "reports:write": "Add daily reports",
  "decisions:write": "Raise decisions",
  "decisions:answer": "Answer decisions (normally the CEO's call)",
  "weekly:write": "Write weekly summaries (always saved as drafts)",
};

/** Written into a weekly report's by-person line when a person has nothing to say. */
export const NO_REPORT_LINE = "No report this week";

/** Status chip wording. Plain business language, never colour alone. */
export const STATUS_COPY: Record<
  StatusLabel,
  { name: string; meaning: string }
> = {
  green: { name: "On track", meaning: "Main goals finished" },
  yellow: { name: "Needs attention", meaning: "Important work half done or unverified" },
  red: { name: "Blocked", meaning: "Work is blocked" },
};
