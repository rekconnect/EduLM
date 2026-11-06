"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";

/**
 * Cloudflare Turnstile widget (explicit render).
 *
 * - Injects the Turnstile script once, renders into a div, and writes the
 *   token into the enclosing <form> as a hidden `cf-turnstile-response` field
 *   (the server reads that exact name).
 * - A token is single-use: pass the server action's `state` as `resetKey` so
 *   every round-trip that returns an error gets a fresh token on the next try.
 * - `onStatus` lets the form hold its submit button until a token exists
 *   ("ready") and explain itself when the script could not load ("blocked").
 * - Theme follows the app (next-themes), not the OS; language follows the
 *   app locale (fr/en/ar); narrow phones get the compact layout because the
 *   flexible one needs at least 300px.
 */

export type TurnstileStatus = "loading" | "ready" | "expired" | "error" | "blocked";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const done = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no api")));
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", () => reject(new Error("script")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = done;
    s.onerror = () => reject(new Error("script"));
    document.head.appendChild(s);
  });
}

export function TurnstileWidget({
  siteKey,
  action,
  resetKey,
  onStatus,
}: {
  siteKey: string;
  /** Must match the `expectedAction` the server verifies with. */
  action: string;
  /** Any value that changes after each server round-trip (e.g. form state). */
  resetKey?: unknown;
  onStatus?: (status: TurnstileStatus) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  // Latest callback without re-running the render effect on every parent render.
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    let cancelled = false;
    statusRef.current?.("loading");
    loadTurnstile()
      .then((api) => {
        if (cancelled || !host.current) return;
        const size = window.matchMedia("(max-width: 420px)").matches ? "compact" : "flexible";
        widgetId.current = api.render(host.current, {
          sitekey: siteKey,
          action,
          theme,
          size,
          language: locale,
          "response-field-name": "cf-turnstile-response",
          callback: () => statusRef.current?.("ready"),
          "expired-callback": () => statusRef.current?.("expired"),
          "timeout-callback": () => statusRef.current?.("expired"),
          "error-callback": () => {
            statusRef.current?.("error");
          },
        });
      })
      .catch(() => {
        // Script blocked (extension, network): the form shows a hint instead
        // of submitting without a token.
        if (!cancelled) statusRef.current?.("blocked");
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* already gone */
        }
        widgetId.current = null;
      }
    };
  }, [siteKey, action, locale, theme]);

  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (widgetId.current && window.turnstile) {
      try {
        statusRef.current?.("loading");
        window.turnstile.reset(widgetId.current);
      } catch {
        /* widget not ready yet */
      }
    }
  }, [resetKey]);

  return <div ref={host} className="flex min-h-[65px] justify-center" />;
}
