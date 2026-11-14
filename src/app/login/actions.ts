"use server";

import { redirect } from "next/navigation";
import { failedLoginDelay, passwordMatches, startSession } from "@/server/auth";

export type LoginState = { error?: string };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const typed = formData.get("password");
  if (typeof typed !== "string" || typed === "") {
    return { error: "Enter the team password." };
  }
  try {
    if (!passwordMatches("site", typed)) {
      await failedLoginDelay();
      return { error: "That password is not right. Try again." };
    }
    await startSession("site");
  } catch (error) {
    console.error(error);
    return { error: "The site is not set up correctly yet. Ask whoever runs it to check the server settings." };
  }
  redirect("/");
}
