"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PersonSlug, Role } from "@/lib/constants";
import { DailyReportDialog } from "./daily-report-dialog";
import { AnswerDecisionDialog, RaiseDecisionDialog } from "./decision-dialogs";
import type { DecisionToAnswer, PersonOption } from "./types";
import { WeeklyDialog } from "./weekly-dialog";

type Open =
  | { kind: "daily" }
  | { kind: "raise" }
  | { kind: "weekly" }
  | { kind: "answer"; decision: DecisionToAnswer }
  | null;

type DialogActions = {
  /** Who is looking: the CEO cannot write reports, so the header hides those buttons. */
  role: Role;
  openDailyReport: () => void;
  openRaiseDecision: () => void;
  openWeekly: () => void;
  openAnswer: (decision: DecisionToAnswer) => void;
};

const DialogsContext = createContext<DialogActions | null>(null);

export function useDialogs(): DialogActions {
  const context = useContext(DialogsContext);
  if (!context) throw new Error("useDialogs must be used inside <DialogsProvider>");
  return context;
}

/**
 * Holds which form dialog is open so the header buttons, the menu on phones and
 * each "Answer" button can all open them. Renders the dialogs once for the page.
 */
export function DialogsProvider({
  people,
  names,
  today,
  currentWeek,
  weekOptions,
  role,
  projects,
  children,
}: {
  people: PersonOption[];
  names: Record<PersonSlug, string>;
  today: string;
  currentWeek: string;
  weekOptions: string[];
  role: Role;
  /** Project names already used, offered as suggestions in the report form. */
  projects: string[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState<Open>(null);
  // Remembered so the answer dialog keeps its text while it fades out.
  const [lastDecision, setLastDecision] = useState<DecisionToAnswer | null>(null);

  const actions = useMemo<DialogActions>(
    () => ({
      role,
      openDailyReport: () => setOpen({ kind: "daily" }),
      openRaiseDecision: () => setOpen({ kind: "raise" }),
      openWeekly: () => setOpen({ kind: "weekly" }),
      openAnswer: (decision) => {
        setLastDecision(decision);
        setOpen({ kind: "answer", decision });
      },
    }),
    [role],
  );
  const close = useCallback(() => setOpen(null), []);

  return (
    <DialogsContext value={actions}>
      {children}
      <DailyReportDialog
        open={open?.kind === "daily"}
        onOpenChange={(next) => !next && close()}
        people={people}
        today={today}
        projects={projects}
      />
      <RaiseDecisionDialog open={open?.kind === "raise"} onOpenChange={(next) => !next && close()} people={people} />
      <AnswerDecisionDialog
        open={open?.kind === "answer"}
        onOpenChange={(next) => !next && close()}
        people={people}
        decision={open?.kind === "answer" ? open.decision : lastDecision}
        role={role}
      />
      <WeeklyDialog
        open={open?.kind === "weekly"}
        onOpenChange={(next) => !next && close()}
        people={people}
        currentWeek={currentWeek}
        weekOptions={weekOptions}
        names={names}
      />
    </DialogsContext>
  );
}
