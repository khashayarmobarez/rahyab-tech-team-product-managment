"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLoginAction, type AdminLoginState } from "./actions";

const initial: AdminLoginState = {};

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLoginAction, initial);
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="admin-password">Admin password</Label>
        <Input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="off"
          required
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "admin-password-error" : undefined}
        />
        {state.error ? (
          <p id="admin-password-error" role="alert" className="text-sm font-medium text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Checking…" : "Open admin"}
      </Button>
    </form>
  );
}
