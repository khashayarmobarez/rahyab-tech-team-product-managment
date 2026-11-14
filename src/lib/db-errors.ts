/**
 * Tells the common "the database is not ready" failures apart from real bugs,
 * so the site can say what to do instead of showing a crash. Pure, so it is tested.
 */
export type DatabaseProblem = "not-configured" | "unreachable" | "not-set-up";

const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED", // nothing is listening
  "ENOTFOUND", // host name does not exist
  "ETIMEDOUT",
  "ECONNRESET",
  "28P01", // wrong password
  "28000", // not allowed in
  "3D000", // database does not exist
  "57P03", // database is starting up
]);

type Errorish = { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };

/** Looks through the error, its causes, and the nested errors Node adds when it tries both IPv4 and IPv6. */
export function databaseProblem(error: unknown): DatabaseProblem | null {
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];
  while (queue.length > 0 && seen.size < 12) {
    const current = queue.shift();
    if (typeof current !== "object" || current === null || seen.has(current)) continue;
    seen.add(current);
    const { code, message, cause, errors } = current as Errorish;
    if (typeof message === "string" && message.startsWith("DATABASE_URL is not set")) return "not-configured";
    if (code === "42P01") return "not-set-up"; // table does not exist
    if (typeof code === "string" && UNREACHABLE_CODES.has(code)) return "unreachable";
    queue.push(cause);
    if (Array.isArray(errors)) queue.push(...errors);
  }
  return null;
}
