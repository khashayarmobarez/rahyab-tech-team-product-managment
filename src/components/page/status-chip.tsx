import { STATUS_COPY, type StatusLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

const CHIP: Record<StatusLabel, string> = {
  green: "bg-status-green-bg text-status-green-fg",
  yellow: "bg-status-yellow-bg text-status-yellow-fg",
  red: "bg-status-red-bg text-status-red-fg",
};
const DOT: Record<StatusLabel, string> = {
  green: "bg-status-green-dot",
  yellow: "bg-status-yellow-dot",
  red: "bg-status-red-dot",
};

/** The only place status colours are used. The word is always there, never colour alone. */
export function StatusChip({ label, className }: { label: StatusLabel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap",
        CHIP[label],
        className,
      )}
    >
      <span aria-hidden className={cn("size-2.5 rounded-full", DOT[label])} />
      {STATUS_COPY[label].name}
    </span>
  );
}

/** A neutral chip for things that are not a status, like "In progress" or "Draft". */
export function NeutralChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-input bg-card px-3 py-1 text-sm font-medium whitespace-nowrap text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
