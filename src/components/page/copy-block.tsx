"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** A block of text to copy, like a command or a settings snippet. */
export function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{label}</p>
        <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`Copy: ${label}`}>
          {copied ? <CheckIcon aria-hidden data-icon="inline-start" /> : <CopyIcon aria-hidden data-icon="inline-start" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg border bg-muted p-3 font-mono text-sm whitespace-pre-wrap select-all">
        {text}
      </pre>
    </div>
  );
}
