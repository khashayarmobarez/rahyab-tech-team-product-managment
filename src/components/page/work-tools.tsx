"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PrinterIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEARCH_MAX, SEARCH_MIN } from "@/lib/rules";

/**
 * Search across every week. It keeps the person, blockers and view choices and
 * drops the week and day, because a search is not limited to one week.
 */
export function SearchBox({ query }: { query: string | undefined }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(query ?? "");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = value.replace(/\s+/g, " ").trim();
    const next = new URLSearchParams(params.toString());
    if (text.length >= SEARCH_MIN) {
      next.set("q", text);
      next.delete("week");
      next.delete("day");
    } else {
      next.delete("q");
    }
    const search = next.toString();
    router.push(`/${search ? `?${search}` : ""}#work`, { scroll: false });
  }

  return (
    <form role="search" onSubmit={submit} className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
      <label htmlFor="work-search" className="sr-only">
        Search every report
      </label>
      <div className="relative min-w-0 flex-1">
        <SearchIcon aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="work-search"
          type="search"
          value={value}
          maxLength={SEARCH_MAX}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search all weeks, like “invoice”"
          className="h-10 w-full rounded-lg border border-input bg-card ps-9 pe-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <Button type="submit" variant="outline" className="h-10">
        Search
      </Button>
    </form>
  );
}

/** Opens the browser's print window. The page has its own print layout (see globals.css), so it can be saved as a PDF. */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <PrinterIcon aria-hidden data-icon="inline-start" />
      Print this view
    </Button>
  );
}
