import { describe, expect, it } from "vitest";
import { databaseProblem } from "./db-errors";

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
