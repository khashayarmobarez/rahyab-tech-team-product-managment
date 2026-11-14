/**
 * Signed session tokens, made with Web Crypto so the same code runs in the proxy
 * and in server code. A token is `kind.expiry.signature`; the signature is an
 * HMAC-SHA-256 over `kind.expiry` made with SESSION_SECRET.
 */

export type SessionKind = "site" | "admin";

export const SESSION_COOKIES: Record<SessionKind, string> = {
  site: "tr_site",
  admin: "tr_admin",
};

/** How long each kind of session lasts, in seconds. */
export const SESSION_TTL_SECONDS: Record<SessionKind, number> = {
  site: 60 * 60 * 24 * 30,
  admin: 60 * 60 * 8,
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signSession(
  kind: SessionKind,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS[kind];
  const body = `${kind}.${expires}`;
  const key = await importKey(secret, "sign");
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySession(
  token: string | undefined,
  kind: SessionKind,
  secret: string | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tokenKind, expires, signature] = parts;
  if (tokenKind !== kind) return false;
  if (!/^\d+$/.test(expires) || Number(expires) * 1000 <= now) return false;
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return false;
  const key = await importKey(secret, "verify");
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(`${tokenKind}.${expires}`));
}
