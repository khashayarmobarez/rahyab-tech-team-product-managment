import { headers } from "next/headers";

/** The address people use to reach the site, like https://reports.example.com. Used in the "connect an agent" guide. */
export async function siteOrigin(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https");
  return `${protocol}://${host}`;
}
