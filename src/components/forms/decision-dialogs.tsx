"use client";

import { useState } from "react";
import { answerDecisionAction, raiseDecisionAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, PersonField, fieldProps } from "./fields";
import type { DecisionToAnswer, PersonOption } from "./types";
import { useIdentity } from "./use-identity";
import { useServerForm } from "./use-server-form";

// ------------------------------------------------------------------ raise --

export function RaiseDecisionDialog({
  open,
  onOpenChange,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: PersonOption[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <RaiseDecisionForm people={people} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RaiseDecisionForm({ people, onClose }: { people: PersonOption[]; onClose: () => void }) {
  const ID = "raise";
  const [person, choosePerson] = useIdentity(people);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { formRef, onSubmit, onInput, pending, errors, formError } = useServerForm({
    action: raiseDecisionAction,
    onSuccess: onClose,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Raise a decision</DialogTitle>
        <DialogDescription>
          Something that needs an answer from the CEO or the team. It stays on the page until someone answers it.
        </DialogDescription>
      </DialogHeader>
      <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="grid gap-5">
        <FormError message={formError} />
        <PersonField idPrefix={ID} people={people} value={person} onChange={choosePerson} errors={errors} />
        <Field id={`${ID}-title`} label="Title" hint="The question, in one line." errors={errors.title}>
          <Input
            {...fieldProps(`${ID}-title`, "title", errors.title, true)}
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field
          id={`${ID}-description`}
          label="Description"
          hint="What the choices are and why it matters now."
          errors={errors.description}
        >
          <Textarea
            {...fieldProps(`${ID}-description`, "description", errors.description, true)}
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Raise decision"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ----------------------------------------------------------------- answer --

export function AnswerDecisionDialog({
  open,
  onOpenChange,
  people,
  decision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: PersonOption[];
  decision: DecisionToAnswer | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {decision ? (
          <AnswerDecisionForm people={people} decision={decision} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AnswerDecisionForm({
  people,
  decision,
  onClose,
}: {
  people: PersonOption[];
  decision: DecisionToAnswer;
  onClose: () => void;
}) {
  const ID = "answer";
  const [person, choosePerson] = useIdentity(people);
  const [answer, setAnswer] = useState("");
  const { formRef, onSubmit, onInput, pending, errors, formError } = useServerForm({
    action: answerDecisionAction,
    onSuccess: onClose,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Answer a decision</DialogTitle>
        <DialogDescription>Your answer is saved and the decision moves to “Recently answered”.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1 rounded-lg border bg-muted p-3">
        <p className="font-semibold">{decision.title}</p>
        <p className="whitespace-pre-line text-muted-foreground">{decision.description}</p>
      </div>
      <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="grid gap-5">
        <FormError message={formError} />
        <input type="hidden" name="decisionId" value={decision.id} />
        <PersonField
          idPrefix={ID}
          people={people}
          value={person}
          onChange={choosePerson}
          errors={errors}
          label="Who is recording this answer?"
        />
        <Field id={`${ID}-answer`} label="Answer" hint="What was decided, and anything the team should do next." errors={errors.answer}>
          <Textarea
            {...fieldProps(`${ID}-answer`, "answer", errors.answer, true)}
            rows={5}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save answer"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
