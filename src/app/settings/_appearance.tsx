"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor, Check, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type ThemeKey = "light" | "dark" | "system";

type Option = {
  key: ThemeKey;
  label: string;
  hint: string;
  icon: LucideIcon;
};

export function AppearancePicker() {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const shouldReduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options: Option[] = [
    {
      key: "light",
      label: t("theme.light"),
      hint: t("settings.appearance.lightHint"),
      icon: Sun,
    },
    {
      key: "dark",
      label: t("theme.dark"),
      hint: t("settings.appearance.darkHint"),
      icon: Moon,
    },
    {
      key: "system",
      label: t("theme.system"),
      hint: t("settings.appearance.systemHint"),
      icon: Monitor,
    },
  ];

  const selected: ThemeKey | undefined = mounted ? (theme as ThemeKey) : undefined;

  return (
    <div
      role="radiogroup"
      aria-label={t("settings.appearance.title")}
      className="grid gap-3 sm:grid-cols-3"
    >
      {options.map((opt, i) => {
        const isSelected = selected === opt.key;
        const Icon = opt.icon;
        return (
          <motion.button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => setTheme(opt.key)}
            initial={{ opacity: 0, y: shouldReduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.2,
              ease: [0.2, 0, 0, 1],
              delay: shouldReduce ? 0 : i * 0.05,
            }}
            whileHover={shouldReduce ? undefined : { y: -2 }}
            whileTap={shouldReduce ? undefined : { scale: 0.985 }}
            className={`group relative rounded-card border p-4 text-start transition-shadow duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] ${
              isSelected
                ? "border-[color:var(--color-brand-500)] bg-[color:var(--color-brand-50)] shadow-card"
                : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] hover:border-[color:var(--color-border-strong)] hover:shadow-card-hover"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={`inline-flex size-9 items-center justify-center rounded-md ${
                  isSelected
                    ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)]"
                    : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]"
                }`}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              {isSelected ? (
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)]"
                  aria-hidden
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm font-semibold text-[color:var(--color-foreground)]">
              {opt.label}
            </p>
            <p className="mt-1 text-xs text-[color:var(--color-foreground-muted)]">
              {opt.hint}
            </p>
          </motion.button>
        );
      })}
    </div>
  );
}
