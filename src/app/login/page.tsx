import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Team Reports" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Team Reports</h1>
        <p className="text-muted-foreground">
          Daily and weekly reports from the IT and software team. Enter the team password to continue.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <LoginForm />
      </div>
    </main>
  );
}
