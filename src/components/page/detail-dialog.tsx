"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * A button (or a whole card) that opens the full text in a dialog. It lets the
 * page keep every box the same small size while nothing is cut off for good.
 * The content is rendered on the server and passed in as children.
 */
export function DetailDialog({
  trigger,
  triggerClassName,
  ariaLabel,
  title,
  subtitle,
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  ariaLabel?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={triggerClassName} aria-label={ariaLabel} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader className="pe-8">
            <DialogTitle className="text-2xl leading-snug">{title}</DialogTitle>
            {subtitle ? <DialogDescription>{subtitle}</DialogDescription> : null}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    </>
  );
}
