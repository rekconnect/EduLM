/**
 * Constants shared by the client forms and the server actions that protect
 * public endpoints. They live in their own client-safe module because
 * "use server" files may only export async functions.
 */

/** Turnstile `action` names — a token is only accepted by the action it was minted for. */
export const TURNSTILE_ACTIONS = {
  signUp: "sign-up",
} as const;

/**
 * Honeypot field name on the sign-up form. Deliberately meaningless so no
 * browser or password-manager autofill heuristic ("company", "organization",
 * "url", "website", …) recognises it — a real parent using address autofill
 * must never trip it.
 */
export const SIGNUP_HONEYPOT_FIELD = "form_meta_9f";
