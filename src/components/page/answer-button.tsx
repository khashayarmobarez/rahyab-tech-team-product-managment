"use client";

import { MessageSquareReplyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/forms/dialogs-provider";
import type { DecisionToAnswer } from "@/components/forms/types";

export function AnswerButton({ decision }: { decision: DecisionToAnswer }) {
  const { openAnswer } = useDialogs();
  return (
    <Button variant="outline" onClick={() => openAnswer(decision)} aria-label={`Answer: ${decision.title}`}>
      <MessageSquareReplyIcon aria-hidden data-icon="inline-start" />
      Answer
    </Button>
  );
}
