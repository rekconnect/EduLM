"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Image as ImageIcon, Loader2, Palette, RotateCcw } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { resetBranding, updateBranding } from "./_actions";

const DEFAULT_LIGHT = "#2C7DB3";
const DEFAULT_DARK = "#4FA6D8";

export function BrandingForm({
  initial,
}: {
  initial: {
    brandLight: string | null;
    brandDark: string | null;
    logoUrl: string | null;
  };
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [resetting, startResetTransition] = useTransition();
  const [light, setLight] = useState(initial.brandLight ?? DEFAULT_LIGHT);
  const [dark, setDark] = useState(initial.brandDark ?? DEFAULT_DARK);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("brandLight", light);
    fd.append("brandDark", dark);
    fd.append("logoUrl", logoUrl);

    startTransition(async () => {
      try {
        const result = await updateBranding(fd);
        if (result.ok) toast.success(t("updatedToast"));
        else toast.error(t("errorToast"));
      } catch {
        toast.error(t("errorToast"));
      }
    });
  }

  function onReset() {
    startResetTransition(async () => {
      try {
        const result = await resetBranding();
        if (result.ok) {
          setLight(DEFAULT_LIGHT);
          setDark(DEFAULT_DARK);
          setLogoUrl("");
          toast.success(t("branding.resetToast"));
        } else {
          toast.error(t("errorToast"));
        }
      } catch {
        toast.error(t("errorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field
        label={t("branding.logoUrl")}
        htmlFor="logoUrl"
        hint={t("branding.logoUrlHint")}
      >
        <div className="flex items-stretch gap-3">
          <Input
            id="logoUrl"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            maxLength={500}
            placeholder="https://cdn.school.example/logo.png"
            className="flex-1"
          />
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)]">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <ImageIcon
                className="size-4 text-[color:var(--color-foreground-subtle)]"
                aria-hidden
              />
            )}
          </div>
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("branding.lightLabel")} htmlFor="brandLight">
          <ColorInput id="brandLight" value={light} onChange={setLight} />
        </Field>
        <Field label={t("branding.darkLabel")} htmlFor="brandDark">
          <ColorInput id="brandDark" value={dark} onChange={setDark} />
        </Field>
      </div>

      <div className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          <Palette className="size-3" aria-hidden />
          {t("branding.previewLabel")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <PreviewCard tone="light" color={light} label={t("branding.lightLabel")} />
          <PreviewCard tone="dark" color={dark} label={t("branding.darkLabel")} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onReset}
          disabled={resetting || pending}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)] disabled:opacity-60"
        >
          {resetting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-3.5" aria-hidden />
          )}
          {t("branding.resetButton")}
        </button>
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

function ColorInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <input
        type="color"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-10 cursor-pointer rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-1"
      />
      <input
        type="text"
        value={value.toUpperCase()}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
        }}
        maxLength={7}
        spellCheck={false}
        className="flex-1 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 font-mono text-sm text-[color:var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-border-focus)]"
        aria-label="Hex value"
      />
    </div>
  );
}

function PreviewCard({
  tone,
  color,
  label,
}: {
  tone: "light" | "dark";
  color: string;
  label: string;
}) {
  const isLight = tone === "light";
  const bg = isLight ? "#FFFFFF" : "#18263C";
  const border = isLight ? "#E3EAF4" : "#243650";
  const text = isLight ? "#0F1E33" : "#E7EEF7";
  const muted = isLight ? "#5B6B82" : "#94A4BD";

  return (
    <div
      className="rounded-md border p-3 text-xs"
      style={{ background: bg, borderColor: border, color: text }}
    >
      <p
        className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: muted }}
      >
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: color }}
        >
          {label}
        </button>
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: hexToRGBA(color, 0.12), color }}
        >
          Badge
        </span>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="text-xs font-medium underline-offset-2 hover:underline"
          style={{ color }}
        >
          Link
        </a>
      </div>
    </div>
  );
}

function hexToRGBA(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
