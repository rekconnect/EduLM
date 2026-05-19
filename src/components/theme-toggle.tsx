"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun, Monitor } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type ThemeKey = "light" | "dark" | "system";

const NEXT: Record<ThemeKey, ThemeKey> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const ICONS: Record<ThemeKey, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("theme");
  const shouldReduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Stable placeholder before hydration to avoid mismatch.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label={t("toggle")}
        className="inline-flex size-8 items-center justify-center rounded-md text-[color:var(--color-foreground-muted)]"
      />
    );
  }

  const current: ThemeKey = (theme as ThemeKey) ?? "system";
  const Icon = ICONS[current];
  const label = t(current);

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[current])}
      aria-label={`${t("toggle")} — ${label}`}
      title={label}
      className="inline-flex size-8 items-center justify-center rounded-md text-[color:var(--color-foreground-muted)] transition duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] active:scale-95"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={current}
          initial={{ opacity: 0, rotate: shouldReduce ? 0 : -90, scale: shouldReduce ? 1 : 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: shouldReduce ? 0 : 90, scale: shouldReduce ? 1 : 0.6 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="inline-flex"
        >
          <Icon className="size-4" />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
