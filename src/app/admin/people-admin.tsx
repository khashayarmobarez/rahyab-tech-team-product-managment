"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError, fieldProps } from "@/components/forms/fields";
import { useServerForm } from "@/components/forms/use-server-form";
import type { Person } from "@/server/reports";
import { updatePersonAction } from "./actions";

export function PeopleAdmin({ people }: { people: Person[] }) {
  return (
    <ul className="grid gap-3">
      {people.map((person) => (
        <PersonRow key={`${person.slug}:${person.name}:${person.active}`} person={person} />
      ))}
    </ul>
  );
}

function PersonRow({ person }: { person: Person }) {
  const [name, setName] = useState(person.name);
  const [active, setActive] = useState(person.active);
  const { formRef, onSubmit, onInput, pending, errors, formError } = useServerForm({
    action: updatePersonAction,
    onSuccess: () => undefined,
  });
  const id = `person-${person.slug}`;
  const changed = name !== person.name || active !== person.active;

  return (
    <li className="rounded-2xl border bg-card p-4 shadow-sm">
      <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <input type="hidden" name="slug" value={person.slug} />
        <div className="sm:col-span-3">
          <FormError message={formError} />
        </div>
        <Field id={`${id}-name`} label={`Name (${person.slug})`} errors={errors.name}>
          <Input {...fieldProps(`${id}-name`, "name", errors.name)} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <label className="flex h-10 items-center gap-3 text-base">
          <input
            type="checkbox"
            name="active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-5 accent-primary"
          />
          Active
        </label>
        <Button type="submit" disabled={pending || !changed}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      {!active ? (
        <p className="mt-3 text-muted-foreground">
          Switched off: {name} no longer appears in the forms. Existing reports stay on the page.
        </p>
      ) : null}
    </li>
  );
}
