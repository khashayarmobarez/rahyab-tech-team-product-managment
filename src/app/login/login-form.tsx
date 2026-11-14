"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="password">Team password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "password-error" : undefined}
        />
        {state.error ? (
          <p id="password-error" role="alert" className="text-sm font-medium text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Checking…" : "Open Team Reports"}
      </Button>
    </form>
  );
}
