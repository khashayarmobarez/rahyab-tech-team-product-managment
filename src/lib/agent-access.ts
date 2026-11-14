/**
 * Rules for what an agent (an API token) may do. Pure, so it is tested.
 */
import { PERSON_SLUGS, type PersonSlug, type TokenScope } from "./constants";

export function hasScope(scopes: readonly TokenScope[], scope: TokenScope): boolean {
  return scopes.includes(scope);
}

/**
 * Which person a write is for.
 *  - A token that belongs to a person can only write for that person.
 *  - A team token must say which person it is writing for.
 */
export function resolveActingPerson(
  owner: string,
  requested: string | undefined,
): { ok: true; person: PersonSlug } | { ok: false; message: string } {
  const isPerson = (value: string): value is PersonSlug => (PERSON_SLUGS as readonly string[]).includes(value);

  if (isPerson(owner)) {
    if (requested !== undefined && requested !== owner) {
      return {
        ok: false,
        message: `This token belongs to ${owner}, so it can only write as ${owner}. Leave "person" out or use "${owner}".`,
      };
    }
    return { ok: true, person: owner };
  }
  if (requested === undefined) {
    return {
      ok: false,
      message: `This is a team token, so "person" is required. Use one of: ${PERSON_SLUGS.join(", ")}.`,
    };
  }
  if (!isPerson(requested)) {
    return { ok: false, message: `Unknown person "${requested}". Use one of: ${PERSON_SLUGS.join(", ")}.` };
  }
  return { ok: true, person: requested };
}

/**
 * A fixed-window rate limiter kept in memory. Each server instance counts on
 * its own, so on serverless hosting this slows runaway agents and password
 * guessing but is not a hard global limit.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }) {
  const { limit, windowMs, now = Date.now } = options;
  const windows = new Map<string, { start: number; count: number }>();

  return {
    /** Counts one request for `key`. */
    check(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
      const time = now();
      // Forget old windows now and then so the map cannot grow without end.
      if (windows.size > 5000) {
        for (const [k, w] of windows) if (time - w.start >= windowMs) windows.delete(k);
      }
      const current = windows.get(key);
      if (!current || time - current.start >= windowMs) {
        windows.set(key, { start: time, count: 1 });
        return { allowed: true };
      }
      if (current.count >= limit) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.start + windowMs - time) / 1000)) };
      }
      current.count += 1;
      return { allowed: true };
    },
  };
}

/** Reads "Authorization: Bearer <token>". Returns undefined for anything else. */
export function bearerToken(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1];
}
