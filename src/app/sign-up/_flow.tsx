"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { TurnstileWidget, type TurnstileStatus } from "@/components/turnstile-widget";
import { SIGNUP_HONEYPOT_FIELD, TURNSTILE_ACTIONS } from "@/lib/turnstile-actions";
import { signUpFamily, type SignUpFamilyState, type SignUpFormErrorCode } from "./_actions";

type Situation = "" | "current" | "past" | "new";

export function SignUpFlow({
  tenantSlug,
  signInHref,
  forgotHref,
  turnstileSiteKey,
}: {
  tenantSlug: string;
  signInHref: string;
  forgotHref: string;
  /** Null when the bot check is not configured for this deployment. */
  turnstileSiteKey: string | null;
}) {
  const t = useTranslations("admissions");
  const tSignIn = useTranslations("signIn");
  const [situation, setSituation] = useState<Situation>("");

  const options: Array<{ value: Situation; label: string }> = [
    { value: "current", label: t("signUpSituationCurrent") },
    { value: "past", label: t("signUpSituationPast") },
    { value: "new", label: t("signUpSituationNew") },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-[color:var(--color-foreground-muted)]">
        {t("signUpSituationLead")}
      </p>

      <fieldset className="space-y-2">
        {options.map((o) => {
          const active = situation === o.value;
          return (
            <label
              key={o.value}
              className={
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors duration-150 ease-out " +
                (active
                  ? "border-[color:var(--color-brand-500)] bg-[color:var(--color-brand-50)]"
                  : "border-[color:var(--color-border-subtle)] hover:bg-[color:var(--color-surface-sunken)]")
              }
            >
              <input
                type="radio"
                name="situation"
                value={o.value}
                checked={active}
                onChange={() => setSituation(o.value)}
                className="mt-0.5 size-4 accent-[color:var(--color-brand-600)]"
              />
              <span className="text-[color:var(--color-foreground)]">{o.label}</span>
            </label>
          );
        })}
      </fieldset>

      {situation === "current" || situation === "past" ? (
        <div className="rounded-lg border border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)] p-4 text-center">
          <p className="text-sm font-semibold text-[color:var(--color-brand-700)]">
            {t("signUpExistingTitle")}
          </p>
          <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
            {t("signUpExistingLead")}
          </p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <Link
              href={signInHref}
              className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-4 py-2 text-sm font-semibold text-[color:var(--color-foreground-onbrand)] transition-all duration-200 ease-out hover:bg-[color:var(--color-brand-700)] active:scale-[0.98]"
            >
              <LogIn className="size-4" aria-hidden />
              {t("signUpExistingCta")}
            </Link>
            <Link
              href={forgotHref}
              className="text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
            >
              {tSignIn("forgot")}
            </Link>
          </div>
        </div>
      ) : null}

      {situation === "new" ? (
        <NewFamilyForm
          tenantSlug={tenantSlug}
          signInHref={signInHref}
          turnstileSiteKey={turnstileSiteKey}
        />
      ) : null}
    </div>
  );
}

function NewFamilyForm({
  tenantSlug,
  signInHref,
  turnstileSiteKey,
}: {
  tenantSlug: string;
  signInHref: string;
  turnstileSiteKey: string | null;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<SignUpFamilyState, FormData>(
    signUpFamily,
    {},
  );
  const [, startTransition] = useTransition();
  // With the bot check on, the submit button waits for a token so a click
  // before the challenge finished can't burn one of the per-IP attempts.
  const [captcha, setCaptcha] = useState<TurnstileStatus>(turnstileSiteKey ? "loading" : "ready");
  const captchaReady = !turnstileSiteKey || captcha === "ready";
  const captchaBlocked = !!turnstileSiteKey && (captcha === "blocked" || captcha === "error");

  // Submit through a transition instead of <form action>: React resets an
  // action-driven form after every round-trip, which would wipe ten fields
  // (four of them passwords) each time the server answers with an error.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !captchaReady) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(fd);
    });
  }

  const errText = (code?: string): string | undefined => {
    if (!code) return undefined;
    if (code === "exists") return t("signUpEmailExists");
    if (code === "staffDomain") return t("signUpEmailStaffDomain");
    if (code === "mismatch") return t("signUpPasswordMismatch");
    if (code === "same") return t("signUpEmailSame");
    return code;
  };

  const formErrText = (code?: SignUpFormErrorCode): string | undefined => {
    switch (code) {
      case undefined:
        return undefined;
      case "unknownTenant":
        return t("signUpErrorUnknownTenant");
      case "tooMany":
        return t("signUpTooMany");
      case "captcha":
        return t("signUpCaptchaFailed");
      case "captchaUnavailable":
        return t("signUpCaptchaUnavailable");
      case "unavailable":
        return t("signUpUnavailable");
    }
  };

  function Responsable({ prefix, title, required }: { prefix: "r1" | "r2"; title: string; required: boolean }) {
    const e = state.errors ?? {};
    return (
      <div className="space-y-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">{title}</h3>
        <Field label={t("signUpEmail")} htmlFor={`${prefix}.email`} required={required} error={errText(e[`${prefix}.email`])}>
          <Input id={`${prefix}.email`} name={`${prefix}.email`} type="email" required={required} autoComplete="email" />
        </Field>
        <Field label={t("signUpLastName")} htmlFor={`${prefix}.lastName`} required={required} error={errText(e[`${prefix}.lastName`])}>
          <Input id={`${prefix}.lastName`} name={`${prefix}.lastName`} required={required} autoComplete="family-name" />
        </Field>
        <Field label={t("signUpFirstName")} htmlFor={`${prefix}.firstName`} required={required} error={errText(e[`${prefix}.firstName`])}>
          <Input id={`${prefix}.firstName`} name={`${prefix}.firstName`} required={required} autoComplete="given-name" />
        </Field>
        <Field label={t("signUpPassword")} htmlFor={`${prefix}.password`} required={required} error={errText(e[`${prefix}.password`])}>
          <Input id={`${prefix}.password`} name={`${prefix}.password`} type="password" minLength={8} required={required} autoComplete="new-password" />
        </Field>
        <Field label={t("signUpPasswordRepeat")} htmlFor={`${prefix}.password2`} required={required} error={errText(e[`${prefix}.password2`])}>
          <Input id={`${prefix}.password2`} name={`${prefix}.password2`} type="password" minLength={8} required={required} autoComplete="new-password" />
        </Field>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Responsable prefix="r1" title={t("signUpResp1")} required />
        <Responsable prefix="r2" title={t("signUpResp2")} required={false} />
      </div>

      {/* Honeypot: off-screen, unfocusable, with a name no autofill heuristic
          recognises. The server drops any submission that fills it. */}
      <div aria-hidden="true" className="absolute -start-[10000px] top-auto h-px w-px overflow-hidden">
        <input name={SIGNUP_HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      {turnstileSiteKey ? (
        <TurnstileWidget
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.signUp}
          resetKey={state}
          onStatus={setCaptcha}
        />
      ) : null}

      {captchaBlocked ? (
        <p role="status" className="text-center text-xs text-[color:var(--color-foreground-muted)]">
          {t("signUpCaptchaBlocked")}
        </p>
      ) : null}

      {state.formError ? (
        <div role="alert" className="rounded-md border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger-soft)] px-3 py-2 text-sm text-[color:var(--color-danger-soft-fg)]">
          {formErrText(state.formError)}
        </div>
      ) : null}

      <Button
        type="submit"
        className="w-full gap-2"
        disabled={pending || !captchaReady}
        aria-busy={pending}
      >
        {pending || !captchaReady ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
        )}
        {pending
          ? tCommon("loading")
          : !captchaReady
            ? t("signUpCaptchaWaiting")
            : t("signUpSubmit")}
      </Button>

      <p className="text-center text-xs text-[color:var(--color-foreground-muted)]">
        <Link href={signInHref} className="hover:text-[color:var(--color-foreground)] hover:underline">
          {t("signUpAlready")}
        </Link>
      </p>
    </form>
  );
}
