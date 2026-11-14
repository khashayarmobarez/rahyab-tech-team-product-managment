import { describe, expect, it } from "vitest";
import { databaseProblem, describeError, describeTarget, isLocalAddress } from "./db-errors";

// Shapes seen from drizzle-orm 0.45 with node-postgres.
const wrapped = (cause: object) => Object.assign(new Error("Failed query: select ..."), { cause });

describe("databaseProblem", () => {
  it("recognises a database nobody is listening on, including the IPv4/IPv6 pair", () => {
    expect(databaseProblem(wrapped({ code: "ECONNREFUSED" }))).toBe("unreachable");
    expect(databaseProblem(wrapped({ errors: [{ code: "ECONNREFUSED" }, { code: "ECONNREFUSED" }] }))).toBe("unreachable");
  });

  it("recognises a wrong password, a missing database and a wrong host", () => {
    expect(databaseProblem(wrapped({ code: "28P01" }))).toBe("unreachable");
    expect(databaseProblem(wrapped({ code: "3D000" }))).toBe("unreachable");
    expect(databaseProblem(wrapped({ code: "ENOTFOUND" }))).toBe("unreachable");
  });

  it("recognises a database that has not been set up", () => {
    expect(databaseProblem(wrapped({ code: "42P01", message: 'relation "people" does not exist' }))).toBe("not-set-up");
  });

  it("recognises a missing DATABASE_URL", () => {
    expect(databaseProblem(new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."))).toBe(
      "not-configured",
    );
  });

  it("leaves real bugs alone", () => {
    expect(databaseProblem(new Error("Cannot read properties of undefined"))).toBeNull();
    expect(databaseProblem(wrapped({ code: "23505" }))).toBeNull(); // a unique-key clash is not a setup problem
    expect(databaseProblem("nope")).toBeNull();
    expect(databaseProblem(null)).toBeNull();
  });

  it("does not loop on an error that points at itself", () => {
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(databaseProblem(loop)).toBeNull();
  });
});

describe("describeError", () => {
  it("shows the real cause behind drizzle's wrapper message", () => {
    const wrapped = Object.assign(new Error('Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"\nparams: '), {
      cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5999"), { code: "ECONNREFUSED" }),
    });
    expect(describeError(wrapped)).toBe(
      'Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle" <- ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5999',
    );
  });

  it("includes the nested errors Node gives when both IPv4 and IPv6 fail, without repeats", () => {
    const one = Object.assign(new Error("connect ECONNREFUSED ::1:5432"), { code: "ECONNREFUSED" });
    const two = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    const text = describeError(Object.assign(new Error("Failed query"), { cause: Object.assign(new Error(""), { code: "ECONNREFUSED", errors: [one, two] }) }));
    expect(text).toContain("::1:5432");
    expect(text).toContain("127.0.0.1:5432");
  });

  it("copes with things that are not errors and with loops", () => {
    expect(describeError("plain text")).toBe("plain text");
    const loop: { cause?: unknown; message: string } = { message: "loop" };
    loop.cause = loop;
    expect(describeError(loop)).toBe("loop");
  });
});

describe("describeTarget", () => {
  it("shows where we connected, never the user or password", () => {
    const text = describeTarget("postgres://someone:secret-pass@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require");
    expect(text).toBe("ep-cool-123-pooler.us-east-2.aws.neon.tech:5432/neondb");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("someone");
  });

  it("handles a missing or broken address", () => {
    expect(describeTarget(undefined)).toContain("empty");
    expect(describeTarget("not a url")).toContain("not a valid");
  });
});

describe("isLocalAddress", () => {
  it("spots addresses that cannot work on a hosting provider", () => {
    expect(isLocalAddress("postgres://u:p@localhost:5432/db")).toBe(true);
    expect(isLocalAddress("postgres://u:p@127.0.0.1:5432/db")).toBe(true);
    expect(isLocalAddress("postgres://u:p@ep-x.neon.tech/db")).toBe(false);
    expect(isLocalAddress(undefined)).toBe(false);
  });
});
