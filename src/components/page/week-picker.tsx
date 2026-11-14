"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/forms/fields";
import { Label } from "@/components/ui/label";

/** Changes which week the first three sections show (?week=YYYY-MM-DD). */
export function WeekPicker({
  selected,
  currentWeek,
  options,
}: {
  selected: string;
  currentWeek: string;
  /** Pairs of week start and label, newest first. */
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(value: string) {
    startTransition(() => {
      router.push(value === currentWeek ? "/" : `/?week=${value}`, { scroll: false });
    });
  }

  return (
    <div className="grid gap-1.5 sm:w-[23rem]" aria-busy={pending}>
      <Label htmlFor="week-picker">Show week</Label>
      <NativeSelect id="week-picker" value={selected} onChange={(event) => choose(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
