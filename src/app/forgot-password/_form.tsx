"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordReset, resetPasswordWithCode } from "./_actions";

type Step = "email" | "code" | "done";

export function ForgotPasswordForm({
  initialEmail,
  initialCode,
}: {
  initialEmail?: string;
  initialCode?: string;
}) {
  const t = useTranslations("forgotPassword");
  const [step, setStep] = useState<Step>(initialEmail && initialCode ? "code" : "email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [code, setCode] = useState(initialCode ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onRequest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      await requestPasswordReset(email);
      setStep("code");
    });
  }

  function onReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError(t("errorPasswordShort"));
    if (password !== confirm) return setError(t("errorPasswordMismatch"));
    startTransition(async () => {
      const res = await resetPasswordWithCode(email, code, password);
      if (res.ok) setStep("done");
      else setError(res.error === "password-too-short" ? t("errorPasswordShort") : t("errorInvalidCode"));
    });
  }

  if (step === "done") {
    return (
      <div className="rounded-[0.75rem] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 text-center shadow-card">
        <CheckCircle2 className="mx-auto size-10 text-[color:var(--color-success-soft-fg)]" aria-hidden />
        <p className="mt-3 text-sm text-[color:var(--color-foreground)]">{t("doneMessage")}</p>
        <Link
          href="/sign-in"
          className="mt-4 inline-flex items-center justify-center rounded-md bg-[color:var(--color-brand-500)] px-4 py-2 text-sm font-semibold text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-600)]"
        >
          {t("doneCta")}
        </Link>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={onReset} className="space-y-4 rounded-[0.75rem] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 shadow-card">
        <p className="flex items-start gap-2 text-sm text-[color:var(--color-foreground-muted)]">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("codeSentHint", { email: email || "…" })}
        </p>
        <label className="block text-sm font-medium text-[color:var(--color-foreground)]">
          {t("codeLabel")}
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD2345"
            autoComplete="one-time-code"
            className="mt-1 font-mono tracking-widest"
            required
          />
        </label>
        <label className="block text-sm font-medium text-[color:var(--color-foreground)]">
          {t("newPasswordLabel")}
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-1"
            required
            minLength={8}
          />
        </label>
        <label className="block text-sm font-medium text-[color:var(--color-foreground)]">
          {t("confirmPasswordLabel")}
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="mt-1"
            required
            minLength={8}
          />
        </label>
        {error ? <p className="text-sm text-[color:var(--color-danger,#dc2626)]">{error}</p> : null}
        <Button type="submit" disabled={pending} className="w-full gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
          {t("resetCta")}
        </Button>
        <button
          type="button"
          onClick={() => { setStep("email"); setError(""); }}
          className="w-full text-center text-xs text-[color:var(--color-foreground-subtle)] hover:underline"
        >
          {t("resendLink")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onRequest} className="space-y-4 rounded-[0.75rem] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 shadow-card">
      <p className="text-sm text-[color:var(--color-foreground-muted)]">{t("emailIntro")}</p>
      <label className="block text-sm font-medium text-[color:var(--color-foreground)]">
        {t("emailLabel")}
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="mt-1"
          required
        />
      </label>
      <Button type="submit" disabled={pending} className="w-full gap-2">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
        {t("sendCta")}
      </Button>
      <p className="text-xs text-[color:var(--color-foreground-subtle)]">{t("privacyHint")}</p>
    </form>
  );
}
