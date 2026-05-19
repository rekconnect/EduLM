"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LOCALES, type Locale } from "@/i18n/config";
import { updateGeneralSettings } from "./_actions";

const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

const TIME_ZONES = [
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Brussels", label: "Europe/Brussels (CET)" },
  { value: "Europe/Madrid", label: "Europe/Madrid (CET)" },
  { value: "Europe/Rome", label: "Europe/Rome (CET)" },
  { value: "Africa/Casablanca", label: "Africa/Casablanca (WEST)" },
  { value: "Africa/Algiers", label: "Africa/Algiers (CET)" },
  { value: "Africa/Tunis", label: "Africa/Tunis (CET)" },
  { value: "Africa/Cairo", label: "Africa/Cairo (EET)" },
  { value: "Asia/Beirut", label: "Asia/Beirut (EET)" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh (AST)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "America/Montreal", label: "America/Montreal (EST)" },
  { value: "America/New_York", label: "America/New_York (EST)" },
];

export function GeneralForm({
  initial,
}: {
  initial: {
    name: string;
    defaultLocale: string;
    enabledLocales: string[];
    timeZone: string;
  };
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initial.name);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(
    (initial.defaultLocale as Locale) || "fr",
  );
  const [enabled, setEnabled] = useState<Set<Locale>>(
    new Set((initial.enabledLocales as Locale[]).filter((l) => LOCALES.includes(l))),
  );
  const [timeZone, setTimeZone] = useState(initial.timeZone || "Europe/Paris");

  function toggleLocale(loc: Locale) {
    const next = new Set(enabled);
    if (next.has(loc)) {
      if (loc === defaultLocale) return;
      next.delete(loc);
    } else {
      next.add(loc);
    }
    if (next.size === 0) return;
    setEnabled(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("name", name);
    fd.append("defaultLocale", defaultLocale);
    for (const loc of enabled) fd.append("enabledLocales", loc);
    fd.append("timeZone", timeZone);

    startTransition(async () => {
      try {
        const result = await updateGeneralSettings(fd);
        if (result.ok) toast.success(t("updatedToast"));
        else toast.error(t("errorToast"));
      } catch {
        toast.error(t("errorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label={t("general.schoolName")} htmlFor="name" required>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
        />
      </Field>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[color:var(--color-foreground)]">
          {t("general.enabledLocales")}
        </label>
        <p className="text-xs text-[color:var(--color-foreground-muted)]">
          {t("general.enabledLocalesHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((loc) => {
            const isOn = enabled.has(loc);
            const isDefault = defaultLocale === loc;
            return (
              <button
                key={loc}
                type="button"
                onClick={() => toggleLocale(loc)}
                aria-pressed={isOn}
                disabled={isDefault}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out",
                  isOn
                    ? "border-[color:var(--color-brand-500)] bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]"
                    : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground-muted)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
                  isDefault && "cursor-not-allowed opacity-100",
                )}
                title={isDefault ? t("general.defaultLockedHint") : undefined}
              >
                {isOn ? <Check className="size-3.5" aria-hidden /> : null}
                {LOCALE_LABELS[loc]}
                {isDefault ? (
                  <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-brand-600)]">
                    · {t("general.defaultBadge")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <Field label={t("general.defaultLocale")} htmlFor="defaultLocale" required>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((loc) => {
            if (!enabled.has(loc)) return null;
            const isSelected = defaultLocale === loc;
            return (
              <button
                key={loc}
                type="button"
                onClick={() => setDefaultLocale(loc)}
                aria-pressed={isSelected}
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out",
                  isSelected
                    ? "border-transparent bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] shadow-card"
                    : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground-muted)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
                )}
              >
                {LOCALE_LABELS[loc]}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label={t("general.timeZone")}
        htmlFor="timeZone"
        hint={t("general.timeZoneHint")}
      >
        <Select
          id="timeZone"
          value={timeZone}
          onChange={(e) => setTimeZone(e.target.value)}
        >
          {TIME_ZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
