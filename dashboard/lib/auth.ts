export const SESSION_COOKIE = "admin_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** SHA-256 of the secret — stored in the HTTP-only session cookie. */
export async function hashSecret(secret: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Returns true if the supplied cookie value matches the current ADMIN_SECRET. */
export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !cookieValue) return false;
  return cookieValue === (await hashSecret(secret));
}
