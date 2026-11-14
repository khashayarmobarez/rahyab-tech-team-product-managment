import {
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AUDIT_SOURCES,
  DECISION_STATUSES,
  PERSON_SLUGS,
  STATUS_LABELS,
  type PersonSlug,
  type TokenScope,
} from "@/lib/constants";

// Every table has id, created_at and updated_at.
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const personSlugEnum = pgEnum("person_slug", PERSON_SLUGS);
export const statusLabelEnum = pgEnum("status_label", STATUS_LABELS);
export const decisionStatusEnum = pgEnum("decision_status", DECISION_STATUSES);
export const auditSourceEnum = pgEnum("audit_source", AUDIT_SOURCES);

export const people = pgTable("people", {
  id: id(),
  slug: personSlugEnum("slug").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dailyReports = pgTable(
  "daily_reports",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    reportDate: date("report_date", { mode: "string" }).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    done: text("done").array().notNull().default([]),
    blockers: text("blockers").array().notNull().default([]),
    next: text("next").array().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("daily_reports_person_date_unique").on(t.personId, t.reportDate),
    index("daily_reports_date_idx").on(t.reportDate),
  ],
);

export type WeeklyNumbers = {
  /** Days with a daily report, per person. */
  daysWithReport: Record<PersonSlug, number>;
  decisionsRaised: number;
  decisionsOpen: number;
};

export const weeklyReports = pgTable("weekly_reports", {
  id: id(),
  /** The Saturday the week starts on. */
  weekStart: date("week_start", { mode: "string" }).notNull().unique(),
  oneLine: text("one_line").notNull(),
  results: text("results").array().notNull().default([]),
  byPerson: jsonb("by_person").$type<Record<PersonSlug, string>>().notNull(),
  waitingDecisions: text("waiting_decisions").array().notNull().default([]),
  notFinished: text("not_finished").array().notNull().default([]),
  numbers: jsonb("numbers").$type<WeeklyNumbers>().notNull(),
  label: statusLabelEnum("label").notNull(),
  /** Thursday 23:59 Tehran time. */
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const decisions = pgTable(
  "decisions",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: decisionStatusEnum("status").notNull().default("open"),
    raisedOn: date("raised_on", { mode: "string" }).notNull(),
    /** A person slug, or "team" for something raised by the team token. */
    raisedBy: text("raised_by").notNull(),
    answeredOn: date("answered_on", { mode: "string" }),
    answer: text("answer"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("decisions_status_idx").on(t.status, t.raisedOn)],
);

export const apiTokens = pgTable("api_tokens", {
  id: id(),
  /** A person slug, or "team". */
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  scopes: text("scopes").array().$type<TokenScope[]>().notNull().default([]),
  /** SHA-256 of the token, in hex. The token itself is never stored. */
  hash: text("hash").notNull().unique(),
  /** First characters of the token, so people can tell tokens apart. */
  prefix: text("prefix").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    /** Who: a person slug, "admin", "team", or the owner of the token used. */
    actor: text("actor").notNull(),
    source: auditSourceEnum("source").notNull(),
    /** What happened, like "daily_report.replaced". */
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    /** One plain sentence for people to read. */
    summary: text("summary").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);
