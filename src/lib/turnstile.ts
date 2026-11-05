/**
 * Cloudflare Turnstile (bot check) — server side.
 *
 * Opt-in by environment: the check is enforced only when BOTH
 * TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set. With neither, public
 * forms render without a widget and `verifyTurnstile` always passes (local
 * dev, tenants that have not set it up). With only one of the two, we warn
 * and stay off: enforcing without a widget would lock everyone out.
 *
 * Once enabled the check FAILS CLOSED, including when Cloudflare's verify
 * endpoint is unreachable — the tenant explicitly asked for a bot gate, and
 * the rate limiter is the layer that stays available in degraded conditions.
 *
 * Dev keys (always pass / always fail) are published by Cloudflare:
 *   site 1x00000000000000000000AA  secret 1x0000000000000000000000000000000AA  (pass)
 *   site 2x00000000000000000000AB  secret 2x0000000000000000000000000000000AA  (fail)
 */

const SITE_KEY = process.env.TURNSTILE_SITE_KEY?.trim() ?? "";
const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

if ((SITE_KEY && !SECRET_KEY) || (!SITE_KEY && SECRET_KEY)) {
  console.warn(
    "[turnstile] TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must both be set — bot check stays OFF.",
  );
}

export function turnstileEnabled(): boolean {
  return Boolean(SITE_KEY && SECRET_KEY);
}

/** Site key for the client widget, or null when the check is off. */
export function turnstileSiteKey(): string | null {
  return turnstileEnabled() ? SITE_KEY : null;
}

export type TurnstileVerdict =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "unavailable" };

/**
 * Verify the token the widget put in the form (`cf-turnstile-response`).
 * `expectedAction` must match the `action` the widget was rendered with, so a
 * token minted on another form cannot be replayed here.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  opts: { remoteIp?: string; expectedAction: string },
): Promise<TurnstileVerdict> {
  if (!turnstileEnabled()) return { ok: true };
  const t = (token ?? "").trim();
  if (!t || t.length > 2048) return { ok: false, reason: "missing" };

  try {
    const body = new URLSearchParams({ secret: SECRET_KEY, response: t });
    if (opts.remoteIp && opts.remoteIp !== "unknown") body.set("remoteip", opts.remoteIp);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const data = (await res.json()) as {
      success?: boolean;
      action?: string;
      "error-codes"?: string[];
    };
    if (!data.success) return { ok: false, reason: "invalid" };
    if (data.action && data.action !== opts.expectedAction) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[turnstile] siteverify failed:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "unavailable" };
  }
}
