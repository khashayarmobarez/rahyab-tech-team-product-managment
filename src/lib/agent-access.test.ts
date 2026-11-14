import { describe, expect, it } from "vitest";
import { bearerToken, createRateLimiter, hasScope, resolveActingPerson } from "./agent-access";

describe("hasScope", () => {
  it("checks the token's permissions", () => {
    expect(hasScope(["reports:read"], "reports:read")).toBe(true);
    expect(hasScope(["reports:read"], "reports:write")).toBe(false);
    expect(hasScope([], "reports:read")).toBe(false);
  });
});

describe("resolveActingPerson", () => {
  it("lets a person's token write only as that person", () => {
    expect(resolveActingPerson("mahan", undefined)).toEqual({ ok: true, person: "mahan" });
    expect(resolveActingPerson("mahan", "mahan")).toEqual({ ok: true, person: "mahan" });
    const other = resolveActingPerson("mahan", "hossein");
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.message).toContain("belongs to mahan");
  });

  it("makes a team token say who it writes for", () => {
    const missing = resolveActingPerson("team", undefined);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.message).toContain("required");
    expect(resolveActingPerson("team", "hossein")).toEqual({ ok: true, person: "hossein" });
    expect(resolveActingPerson("team", "nobody").ok).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit in a window, then says when to retry", () => {
    let time = 1_000_000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => time });
    expect(limiter.check("a")).toEqual({ allowed: true });
    expect(limiter.check("a")).toEqual({ allowed: true });
    expect(limiter.check("a")).toEqual({ allowed: true });
    time += 20_000;
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it("starts a fresh window afterwards and counts keys separately", () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
    time += 1000;
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("bearerToken", () => {
  it("reads a bearer token and nothing else", () => {
    expect(bearerToken("Bearer tr_abc")).toBe("tr_abc");
    expect(bearerToken("bearer tr_abc")).toBe("tr_abc");
    expect(bearerToken("Basic abc")).toBeUndefined();
    expect(bearerToken("Bearer")).toBeUndefined();
    expect(bearerToken("Bearer a b")).toBeUndefined();
    expect(bearerToken(null)).toBeUndefined();
  });
});
