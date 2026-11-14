import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIES,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
  type SessionKind,
} from "@/lib/session";

/** Where each cookie is sent. The admin cookie only travels to /admin. */
const COOKIE_PATH: Record<SessionKind, string> = { site: "/", admin: "/admin" };

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short. Set it to a long random value (see .env.example).");
  }
  return secret;
}

const PASSWORD_VARIABLES: Record<SessionKind, string> = {
  site: "SITE_PASSWORD",
  admin: "ADMIN_PASSWORD",
};

/** Compares a typed password with the one in the environment, in constant time. */
export function passwordMatches(kind: SessionKind, typed: string): boolean {
  const expected = process.env[PASSWORD_VARIABLES[kind]];
  if (!expected) {
    throw new Error(`${PASSWORD_VARIABLES[kind]} is not set (see .env.example).`);
  }
  const a = createHash("sha256").update(typed).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function startSession(kind: SessionKind): Promise<void> {
  const token = await signSession(kind, sessionSecret());
  (await cookies()).set(SESSION_COOKIES[kind], token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH[kind],
    maxAge: SESSION_TTL_SECONDS[kind],
  });
}

export async function endSession(kind: SessionKind): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIES[kind], path: COOKIE_PATH[kind] });
}

export async function hasSession(kind: SessionKind): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIES[kind])?.value;
  // Checking expiry reads the clock, so wait for a real request first.
  await connection();
  return verifySession(token, kind, process.env.SESSION_SECRET);
}

/** Pages and actions call this. The proxy checks too, but it is not the only guard. */
export async function requireSiteSession(): Promise<void> {
  if (!(await hasSession("site"))) redirect("/login");
}

/** True when the visitor has signed in to the site and then to /admin. */
export async function hasAdminAccess(): Promise<boolean> {
  return (await hasSession("site")) && (await hasSession("admin"));
}

/** For admin actions. Sends the visitor to the right sign-in if either session is missing. */
export async function requireAdminAccess(): Promise<void> {
  await requireSiteSession();
  if (!(await hasSession("admin"))) redirect("/admin");
}

/** A short pause after a wrong password, to slow down guessing. */
export function failedLoginDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 700));
}
