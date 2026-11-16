"use server";

import { redirect } from "next/navigation";
import { ceoPasswordConfigured, endSession, failedLoginDelay, passwordMatches, startSession } from "@/server/auth";

export type LoginState = { error?: string };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const typed = formData.get("password");
  if (typeof typed !== "string" || typed === "") {
    return { error: "Enter the password." };
  }
  try {
    if (passwordMatches("site", typed)) {
      // A team sign-in clears any earlier CEO sign-in on this browser.
      await endSession("ceo");
      await startSession("site");
    } else if (ceoPasswordConfigured() && passwordMatches("ceo", typed)) {
      await startSession("site");
      await startSession("ceo");
    } else {
      await failedLoginDelay();
      return { error: "That password is not right. Try again." };
    }
  } catch (error) {
    console.error(error);
    return { error: "The site is not set up correctly yet. Ask whoever runs it to check the server settings." };
  }
  redirect("/");
}

/** Ends every session this browser has (team, CEO and admin) and goes back to the sign-in page. */
export async function logoutAction(): Promise<void> {
  await Promise.all([endSession("site"), endSession("ceo"), endSession("admin")]);
  redirect("/login");
}
