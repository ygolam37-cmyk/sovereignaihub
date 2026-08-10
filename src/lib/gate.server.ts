// Server-verifiable access gate.
//
// The app's login screen is a client-side algorithmic challenge, so it cannot
// authorize anything on its own. This module issues a signed, server-verifiable
// session cookie once a caller solves a server-issued proof-of-work challenge,
// and validates that cookie before any expensive or state-changing work runs.

const COOKIE = "sov_gate";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Number of leading zero hex chars required in the PoW digest. */
export const POW_DIFFICULTY = 4;

function secret(): string {
  const s = process.env["GATE_SECRET"];
  if (!s) throw new Error("GATE_SECRET is not configured");
  return s;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function eq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------- challenge ------------------------------- */

export async function issueChallenge(): Promise<{ challenge: string; difficulty: number }> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const payload = `c.${nonce}.${exp}`;
  return { challenge: `${payload}.${await hmac(payload)}`, difficulty: POW_DIFFICULTY };
}

async function challengeValid(challenge: string): Promise<boolean> {
  const parts = challenge.split(".");
  if (parts.length !== 4 || parts[0] !== "c") return false;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return eq(parts[3], await hmac(`c.${parts[1]}.${parts[2]}`));
}

/** Verifies a solved challenge and returns a signed session token, or null. */
export async function redeemChallenge(
  challenge: string,
  solution: string,
): Promise<string | null> {
  if (!(await challengeValid(challenge))) return null;
  if (typeof solution !== "string" || solution.length === 0 || solution.length > 64) return null;
  const digest = await sha256Hex(`${challenge}:${solution}`);
  if (!digest.startsWith("0".repeat(POW_DIFFICULTY))) return null;
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `s.${b64url(crypto.getRandomValues(new Uint8Array(12)))}.${exp}`;
  return `${payload}.${await hmac(payload)}`;
}

/* -------------------------------- session -------------------------------- */

export async function sessionValid(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "s") return false;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return eq(parts[3], await hmac(`s.${parts[1]}.${parts[2]}`));
}

export function readCookie(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function sessionCookie(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
