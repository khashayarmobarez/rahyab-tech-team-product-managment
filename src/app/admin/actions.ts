"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { failure, type ActionResult } from "@/lib/action-result";
import { parseCreateTokenForm, parseUpdatePersonForm } from "@/lib/form-parsers";
import { fieldErrorsOf } from "@/lib/schemas";
import {
  endSession,
  failedLoginDelay,
  passwordMatches,
  requireAdminAccess,
  requireSiteSession,
  startSession,
} from "@/server/auth";
import { createApiToken, revokeApiToken, updatePerson } from "@/server/reports";

const ADMIN = { actor: "admin", source: "web" } as const;

function toFailure(error: unknown): ActionResult<never> {
  const fieldErrors = fieldErrorsOf(error);
  if (fieldErrors) return failure(fieldErrors);
  console.error(error);
  return failure({}, "Something went wrong and nothing was changed. Please try again.");
}

// ------------------------------------------------------------------ sign in --

export type AdminLoginState = { error?: string };

export async function adminLoginAction(_previous: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  await requireSiteSession();
  const typed = formData.get("password");
  if (typeof typed !== "string" || typed === "") return { error: "Enter the admin password." };
  try {
    if (!passwordMatches("admin", typed)) {
      await failedLoginDelay();
      return { error: "That password is not right. Try again." };
    }
    await startSession("admin");
  } catch (error) {
    console.error(error);
    return { error: "Admin is not set up correctly yet. Check ADMIN_PASSWORD and SESSION_SECRET on the server." };
  }
  redirect("/admin");
}

export async function adminLogoutAction(): Promise<void> {
  await requireSiteSession();
  await endSession("admin");
  redirect("/admin");
}

// ------------------------------------------------------------------- people --

export async function updatePersonAction(formData: FormData): Promise<ActionResult> {
  await requireAdminAccess();
  try {
    const person = await updatePerson(parseUpdatePersonForm(formData), ADMIN);
    refresh();
    return { ok: true, message: `${person.name} saved.` };
  } catch (error) {
    return toFailure(error);
  }
}

// ------------------------------------------------------------------- tokens --

export type CreatedToken = { token: string; name: string };

export async function createTokenAction(formData: FormData): Promise<ActionResult<CreatedToken>> {
  await requireAdminAccess();
  try {
    const { token, info } = await createApiToken(parseCreateTokenForm(formData), ADMIN);
    refresh();
    return { ok: true, message: "Token created. Copy it now: it is shown only once.", data: { token, name: info.name } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function revokeTokenAction(formData: FormData): Promise<ActionResult> {
  await requireAdminAccess();
  const id = formData.get("id");
  try {
    if (typeof id !== "string") return failure({}, "Pick a token to revoke.");
    await revokeApiToken(id, ADMIN);
    refresh();
    return { ok: true, message: "Token revoked. It no longer works." };
  } catch (error) {
    return toFailure(error);
  }
}
