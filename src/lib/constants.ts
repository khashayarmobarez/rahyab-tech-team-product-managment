export const PERSON_SLUGS = ["khashayar", "mahan", "hossein"] as const;
export type PersonSlug = (typeof PERSON_SLUGS)[number];

export const STATUS_LABELS = ["green", "yellow", "red"] as const;
export type StatusLabel = (typeof STATUS_LABELS)[number];

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
  "weekly:write",
] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const TOKEN_SCOPE_LABELS: Record<TokenScope, string> = {
  "reports:read": "Read reports and decisions",
  "reports:write": "Add daily reports",
  "decisions:write": "Raise and answer decisions",
  "weekly:write": "Write weekly summaries",
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
