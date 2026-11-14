"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FormError, NativeSelect, fieldProps } from "@/components/forms/fields";
import { useServerForm } from "@/components/forms/use-server-form";
import { PERSON_SLUGS, TOKEN_SCOPES, TOKEN_SCOPE_LABELS } from "@/lib/constants";
import { formatTehranDateTime } from "@/lib/dates";
import type { ApiTokenInfo } from "@/server/reports";
import { createTokenAction, revokeTokenAction, type CreatedToken } from "./actions";

type OwnerOption = { value: string; label: string };

export function TokensAdmin({ tokens, owners }: { tokens: ApiTokenInfo[]; owners: OwnerOption[] }) {
  const [created, setCreated] = useState<CreatedToken | null>(null);

  return (
    <div className="grid gap-6">
      {created ? <NewTokenNotice created={created} onDismiss={() => setCreated(null)} /> : null}
      <CreateTokenForm owners={owners} onCreated={setCreated} />
      <TokenList tokens={tokens} />
    </div>
  );
}

/** The plain token is shown here once. After this it exists nowhere but where it was pasted. */
function NewTokenNotice({ created, onDismiss }: { created: CreatedToken; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Select the token and copy it by hand.");
    }
  }

  return (
    <div role="status" className="grid gap-3 rounded-2xl border-2 border-primary bg-accent p-5 text-accent-foreground">
      <p className="font-semibold">Token “{created.name}” is ready. Copy it now.</p>
      <p>It is shown only this once. Only a one-way fingerprint is stored, so nobody can look it up later.</p>
      <code className="block rounded-lg border bg-card p-3 font-mono text-base break-all text-foreground select-all">
        {created.token}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy}>
          {copied ? <CheckIcon aria-hidden data-icon="inline-start" /> : <CopyIcon aria-hidden data-icon="inline-start" />}
          {copied ? "Copied" : "Copy token"}
        </Button>
        <Button type="button" variant="outline" onClick={onDismiss}>
          I have saved it
        </Button>
      </div>
    </div>
  );
}

function CreateTokenForm({ owners, onCreated }: { owners: OwnerOption[]; onCreated: (token: CreatedToken) => void }) {
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("team");
  const [scopes, setScopes] = useState<string[]>(["reports:read"]);
  const { formRef, onSubmit, onInput, pending, errors, formError } = useServerForm<CreatedToken>({
    action: createTokenAction,
    onSuccess: (data) => {
      if (data) onCreated(data);
      setName("");
    },
  });

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onInput={onInput}
      noValidate
      className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm"
      aria-labelledby="new-token-title"
    >
      <h3 id="new-token-title" className="flex items-center gap-2 text-lg font-semibold">
        <KeyRoundIcon aria-hidden className="size-5" />
        Create a token
      </h3>
      <FormError message={formError} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="token-name" label="Name" hint="What it is for, like “Mahan's assistant”." errors={errors.name}>
          <Input {...fieldProps("token-name", "name", errors.name, true)} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="token-owner" label="Belongs to" hint="Reports it adds are credited to this person." errors={errors.owner}>
          <NativeSelect {...fieldProps("token-owner", "owner", errors.owner, true)} value={owner} onChange={(e) => setOwner(e.target.value)}>
            {owners.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="grid gap-2" aria-describedby={errors.scopes ? "token-scopes-error" : undefined}>
        <legend className="mb-1 text-base font-medium">What it may do</legend>
        {TOKEN_SCOPES.map((scope, index) => (
          <label key={scope} className="flex items-center gap-3 text-base">
            <input
              type="checkbox"
              name="scopes"
              value={scope}
              checked={scopes.includes(scope)}
              data-fields={index === 0 ? "scopes" : undefined}
              onChange={(e) => setScopes(e.target.checked ? [...scopes, scope] : scopes.filter((s) => s !== scope))}
              className="size-5 accent-primary"
            />
            {TOKEN_SCOPE_LABELS[scope]}
          </label>
        ))}
        <FieldError id="token-scopes-error" errors={errors.scopes} />
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create token"}
        </Button>
      </div>
    </form>
  );
}

function TokenList({ tokens }: { tokens: ApiTokenInfo[] }) {
  if (tokens.length === 0) {
    return <p className="rounded-2xl border border-dashed bg-card p-5 text-muted-foreground">No tokens yet.</p>;
  }
  return (
    <ul className="grid gap-3" aria-label="Existing tokens">
      {tokens.map((token) => (
        <TokenRow key={token.id} token={token} />
      ))}
    </ul>
  );
}

function ownerLabel(owner: string): string {
  if (owner === "team") return "The whole team";
  return (PERSON_SLUGS as readonly string[]).includes(owner) ? owner.charAt(0).toUpperCase() + owner.slice(1) : owner;
}

function TokenRow({ token }: { token: ApiTokenInfo }) {
  const [confirming, setConfirming] = useState(false);
  const { formRef, onSubmit, pending, formError } = useServerForm({
    action: revokeTokenAction,
    onSuccess: () => setConfirming(false),
  });
  const revoked = token.revokedAt !== null;

  return (
    <li className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="grid gap-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold">{token.name}</span>
          <code className="font-mono text-muted-foreground">{token.prefix}…</code>
          <span className="rounded-full border px-2.5 py-0.5 text-sm font-medium">{revoked ? "Revoked" : "Active"}</span>
        </p>
        <p>
          Belongs to {ownerLabel(token.owner)} · may: {token.scopes.map((s) => TOKEN_SCOPE_LABELS[s] ?? s).join(", ")}
        </p>
        <p className="text-muted-foreground">
          Created {formatTehranDateTime(token.createdAt)} ·{" "}
          {token.lastUsedAt ? `last used ${formatTehranDateTime(token.lastUsedAt)}` : "never used"}
          {revoked ? ` · revoked ${formatTehranDateTime(token.revokedAt!)}` : ""}
        </p>
        <FormError message={formError} />
      </div>
      {!revoked ? (
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={token.id} />
          {confirming ? (
            <>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Revoking…" : "Yes, revoke it"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
              Revoke
            </Button>
          )}
        </form>
      ) : null}
    </li>
  );
}
