"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { signUpFamily, type SignUpFamilyState } from "./_actions";

type Situation = "" | "current" | "past" | "new";

export function SignUpFlow({
  tenantSlug,
  signInHref,
  forgotHref,
}: {
  tenantSlug: string;
  signInHref: string;
  forgotHref: string;
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
        <NewFamilyForm tenantSlug={tenantSlug} signInHref={signInHref} />
      ) : null}
    </div>
  );
}

function NewFamilyForm({
  tenantSlug,
  signInHref,
}: {
  tenantSlug: string;
  signInHref: string;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<SignUpFamilyState, FormData>(
    signUpFamily,
    {},
  );

  const errText = (code?: string): string | undefined => {
    if (!code) return undefined;
    if (code === "exists") return t("signUpEmailExists");
    if (code === "mismatch") return t("signUpPasswordMismatch");
    if (code === "same") return t("signUpEmailSame");
    return code;
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
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Responsable prefix="r1" title={t("signUpResp1")} required />
        <Responsable prefix="r2" title={t("signUpResp2")} required={false} />
      </div>

      {state.formError ? (
        <div role="alert" className="rounded-md border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger-soft)] px-3 py-2 text-sm text-[color:var(--color-danger-soft-fg)]">
          {state.formError}
        </div>
      ) : null}

      <Button type="submit" className="w-full gap-2" disabled={pending} aria-busy={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />}
        {pending ? tCommon("loading") : t("signUpSubmit")}
      </Button>

      <p className="text-center text-xs text-[color:var(--color-foreground-muted)]">
        <Link href={signInHref} className="hover:text-[color:var(--color-foreground)] hover:underline">
          {t("signUpAlready")}
        </Link>
      </p>
    </form>
  );
}
