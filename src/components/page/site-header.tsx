"use client";

import { CalendarCheckIcon, MessageSquarePlusIcon, NotebookPenIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDialogs } from "@/components/forms/dialogs-provider";

const LINKS = [
  { href: "#this-week", label: "This week" },
  { href: "#by-person", label: "By person" },
  { href: "#decisions", label: "Decisions" },
  { href: "#past-weeks", label: "Past weeks" },
];

/** Sticky header: section links, and the buttons that open the forms. */
export function SiteHeader() {
  const { openDailyReport, openRaiseDecision, openWeekly } = useDialogs();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2">
        <a href="#top" className="text-lg font-semibold tracking-tight">
          Team Reports
        </a>

        <nav
          aria-label="Sections"
          className="order-3 flex w-full flex-wrap justify-between gap-x-1 md:order-none md:w-auto md:justify-start md:gap-x-2"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-1 py-2 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground md:px-2 md:text-base"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Wide screens: the three buttons side by side. */}
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="default" onClick={openDailyReport}>
            <NotebookPenIcon aria-hidden data-icon="inline-start" />
            Add my report
          </Button>
          <Button variant="outline" onClick={openRaiseDecision}>
            <MessageSquarePlusIcon aria-hidden data-icon="inline-start" />
            Raise a decision
          </Button>
          <Button variant="outline" onClick={openWeekly}>
            <CalendarCheckIcon aria-hidden data-icon="inline-start" />
            Weekly summary
          </Button>
        </div>

        {/* Phones: one Add menu keeps the header short. */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="default" />}>
              <PlusIcon aria-hidden data-icon="inline-start" />
              Add
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem className="py-2.5 text-base" onClick={openDailyReport}>
                <NotebookPenIcon aria-hidden />
                Add my report
              </DropdownMenuItem>
              <DropdownMenuItem className="py-2.5 text-base" onClick={openRaiseDecision}>
                <MessageSquarePlusIcon aria-hidden />
                Raise a decision
              </DropdownMenuItem>
              <DropdownMenuItem className="py-2.5 text-base" onClick={openWeekly}>
                <CalendarCheckIcon aria-hidden />
                Write the weekly summary
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
