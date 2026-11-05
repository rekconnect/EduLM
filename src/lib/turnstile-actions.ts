/**
 * Turnstile `action` names, shared by the client widget and the server check
 * (a token is only accepted by the action it was minted for). Lives in its
 * own client-safe module because "use server" files may only export async
 * functions.
 */
export const TURNSTILE_ACTIONS = {
  signUp: "sign-up",
} as const;
