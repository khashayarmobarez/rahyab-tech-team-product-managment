import { CheckIcon, CircleDashedIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A plain list of lines with a small marker. Renders nothing for an empty list. */
export function MarkedList({
  items,
  marker = "dot",
  className,
}: {
  items: string[];
  marker?: "dot" | "check" | "open";
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("grid gap-1.5", className)}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex items-start gap-2">
          {marker === "check" ? (
            <CheckIcon aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : marker === "open" ? (
            <CircleDashedIcon aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function SectionHeading({
  id,
  children,
  aside,
}: {
  id: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 id={id} className="text-2xl font-semibold tracking-tight">
        {children}
      </h2>
      {aside}
    </div>
  );
}
