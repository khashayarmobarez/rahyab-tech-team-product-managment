import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, signSession, verifySession } from "./session";

const secret = "a-test-secret-that-is-long-enough-1234";
const now = Date.UTC(2026, 10, 14, 12, 0, 0);

describe("session tokens", () => {
  it("accepts a fresh token of the right kind", async () => {
    const token = await signSession("site", secret, now);
    expect(await verifySession(token, "site", secret, now + 1000)).toBe(true);
  });

  it("rejects a token of the other kind", async () => {
    const token = await signSession("site", secret, now);
    expect(await verifySession(token, "admin", secret, now)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await signSession("admin", secret, now);
    const justBefore = now + (SESSION_TTL_SECONDS.admin - 1) * 1000;
    const justAfter = now + (SESSION_TTL_SECONDS.admin + 1) * 1000;
    expect(await verifySession(token, "admin", secret, justBefore)).toBe(true);
    expect(await verifySession(token, "admin", secret, justAfter)).toBe(false);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession("site", "another-secret-another-secret-123456", now);
    expect(await verifySession(token, "site", secret, now)).toBe(false);
  });

  it("rejects a token whose expiry was edited", async () => {
    const token = await signSession("site", secret, now);
    const [kind, , signature] = token.split(".");
    const forged = `${kind}.${Math.floor(now / 1000) + 10 ** 9}.${signature}`;
    expect(await verifySession(forged, "site", secret, now)).toBe(false);
  });

  it("rejects empty, malformed and unconfigured cases", async () => {
    expect(await verifySession(undefined, "site", secret, now)).toBe(false);
    expect(await verifySession("", "site", secret, now)).toBe(false);
    expect(await verifySession("site.123", "site", secret, now)).toBe(false);
    expect(await verifySession("site.abc.def", "site", secret, now)).toBe(false);
    const token = await signSession("site", secret, now);
    expect(await verifySession(token, "site", undefined, now)).toBe(false);
  });
});
