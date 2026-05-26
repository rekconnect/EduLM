"use client";

/**
 * Right-side drawer for the WYSIWYG inscription-form editor.
 * Subscribes to `usePreviewEditMode().activeFieldKey` — when set, the
 * drawer opens with the corresponding registry entry. Local form
 * state is seeded from the current tenant override merged onto the
 * registry default; placeholders show the registry default so admin
 * always sees what they're overriding.
 *
 * Save dispatches `saveFieldOverride`; Réinitialiser dispatches
 * `resetFieldOverride`. Both then close the drawer + router.refresh()
 * so the underlying form re-renders with the new tenant config.
 *
 * Dirty-state close: clicking outside / ESC / X — if there are
 * unsaved changes, prompt before closing. Otherwise close immediately.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePreviewEditMode } from "@/components/dossier/preview-edit-mode-context";
import { useTenantConfig } from "@/components/dossier/tenant-config-context";
import {
  getInscriptionFieldEntry,
  type DossierFieldLabel,
} from "@/lib/inscription-fields-registry";
import {
  saveFieldOverride,
  resetFieldOverride,
} from "@/app/(app)/admin/inscription-config/_field-override-actions";

type LocaleKey = keyof DossierFieldLabel;

const LOCALE_LABELS: Record<LocaleKey, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

export function FieldEditDrawer() {
  const router = useRouter();
  const { activeFieldKey, setActiveFieldKey } = usePreviewEditMode();
  const { config } = useTenantConfig();

  // ── Compute "what's the current state of this field" ─────────────
  // We need the entry from the registry (for defaults + metadata) and
  // the current tenant override (for the pre-filled form values).
  const entry = activeFieldKey
    ? getInscriptionFieldEntry(activeFieldKey)
    : undefined;
  const currentOverride = activeFieldKey
    ? config?.fields?.[activeFieldKey]
    : undefined;
  const hasOverride = Boolean(currentOverride);

  // ── Local form state ──────────────────────────────────────────────
  // Reset on every drawer open so we never leak previous field's state.
  const initialFormState = useMemo(() => {
    return {
      labelFr: currentOverride?.label?.fr ?? "",
      labelEn: currentOverride?.label?.en ?? "",
      labelAr: currentOverride?.label?.ar ?? "",
      required:
        typeof currentOverride?.required === "boolean"
          ? currentOverride.required
          : entry?.defaultRequired ?? false,
      hidden: currentOverride?.hidden === true,
    };
  }, [activeFieldKey, currentOverride, entry]);

  const [labelFr, setLabelFr] = useState(initialFormState.labelFr);
  const [labelEn, setLabelEn] = useState(initialFormState.labelEn);
  const [labelAr, setLabelAr] = useState(initialFormState.labelAr);
  const [required, setRequired] = useState(initialFormState.required);
  const [hidden, setHidden] = useState(initialFormState.hidden);
  const [localeTab, setLocaleTab] = useState<LocaleKey>("fr");
  const [pendingSave, startSave] = useTransition();
  const [pendingReset, startReset] = useTransition();

  // Reset form state whenever the active field changes (drawer reopens).
  useEffect(() => {
    setLabelFr(initialFormState.labelFr);
    setLabelEn(initialFormState.labelEn);
    setLabelAr(initialFormState.labelAr);
    setRequired(initialFormState.required);
    setHidden(initialFormState.hidden);
    setLocaleTab("fr");
  }, [initialFormState]);

  const isDirty =
    labelFr !== initialFormState.labelFr ||
    labelEn !== initialFormState.labelEn ||
    labelAr !== initialFormState.labelAr ||
    required !== initialFormState.required ||
    hidden !== initialFormState.hidden;

  // ── Close handlers ────────────────────────────────────────────────
  function closeDrawer() {
    if (isDirty) {
      const confirmed = window.confirm(
        "Vous avez des modifications non enregistrées. Fermer quand même ?",
      );
      if (!confirmed) return;
    }
    setActiveFieldKey(null);
  }

  // Radix's Sheet onOpenChange fires on ESC, click-outside, and X.
  function onOpenChange(open: boolean) {
    if (!open) closeDrawer();
  }

  // ── Save + reset ──────────────────────────────────────────────────
  function onSave() {
    if (!activeFieldKey || !entry) return;
    startSave(async () => {
      const payload = {
        label: {
          fr: labelFr.trim() || undefined,
          en: labelEn.trim() || undefined,
          ar: labelAr.trim() || undefined,
        },
        required,
        hidden,
      };
      const r = await saveFieldOverride(activeFieldKey, payload);
      if (r.ok) {
        toast.success("Champ enregistré");
        setActiveFieldKey(null);
        router.refresh();
      } else {
        toast.error(`Erreur : ${r.error ?? "inconnue"}`);
      }
    });
  }

  function onReset() {
    if (!activeFieldKey) return;
    if (!hasOverride) return;
    const confirmed = window.confirm(
      "Réinitialiser ce champ à sa valeur par défaut ?",
    );
    if (!confirmed) return;
    startReset(async () => {
      const r = await resetFieldOverride(activeFieldKey);
      if (r.ok) {
        toast.success("Champ réinitialisé");
        setActiveFieldKey(null);
        router.refresh();
      } else {
        toast.error(`Erreur : ${r.error ?? "inconnue"}`);
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────
  const open = Boolean(activeFieldKey && entry);
  if (!entry || !activeFieldKey) {
    // Render the Sheet anyway with open=false so it doesn't pop on
    // first render (would cause a flash). Just return early.
    return <Sheet open={false} onOpenChange={() => {}} />;
  }

  const pending = pendingSave || pendingReset;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="text-start">
          <SheetTitle>Modifier le champ</SheetTitle>
          <SheetDescription>
            <span className="font-mono text-[11px]">{activeFieldKey}</span>
            <span className="mx-1">·</span>
            <span className="capitalize">{entry.tab}</span>
            <span className="mx-1">/</span>
            <span>{entry.section}</span>
            {entry.subSection ? (
              <>
                <span className="mx-1">/</span>
                <span>{entry.subSection}</span>
              </>
            ) : null}
          </SheetDescription>
          {entry.note ? (
            <p className="mt-1 rounded-md bg-[color:var(--color-warning-soft)] px-2.5 py-1.5 text-xs text-[color:var(--color-warning-soft-fg)]">
              {entry.note}
            </p>
          ) : null}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* ── Locale tabs for label override ── */}
          <div>
            <p className="mb-2 text-sm font-medium text-[color:var(--color-foreground)]">
              Libellé
            </p>
            <Tabs
              value={localeTab}
              onValueChange={(v) => setLocaleTab(v as LocaleKey)}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="fr">{LOCALE_LABELS.fr}</TabsTrigger>
                <TabsTrigger value="en">{LOCALE_LABELS.en}</TabsTrigger>
                <TabsTrigger value="ar">{LOCALE_LABELS.ar}</TabsTrigger>
              </TabsList>
              <TabsContent value="fr" className="mt-3">
                <Input
                  value={labelFr}
                  onChange={(e) => setLabelFr(e.target.value)}
                  placeholder={entry.defaultLabel.fr}
                  maxLength={200}
                />
                <p className="mt-1.5 text-xs text-[color:var(--color-foreground-muted)]">
                  Par défaut : {entry.defaultLabel.fr}
                </p>
              </TabsContent>
              <TabsContent value="en" className="mt-3">
                <Input
                  value={labelEn}
                  onChange={(e) => setLabelEn(e.target.value)}
                  placeholder={entry.defaultLabel.en}
                  maxLength={200}
                />
                <p className="mt-1.5 text-xs text-[color:var(--color-foreground-muted)]">
                  Default: {entry.defaultLabel.en}
                </p>
              </TabsContent>
              <TabsContent value="ar" className="mt-3">
                <Input
                  value={labelAr}
                  onChange={(e) => setLabelAr(e.target.value)}
                  placeholder={entry.defaultLabel.ar}
                  maxLength={200}
                  lang="ar"
                  dir="rtl"
                />
                <p className="mt-1.5 text-xs text-[color:var(--color-foreground-muted)]" dir="rtl">
                  افتراضي: {entry.defaultLabel.ar}
                </p>
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Required toggle ── */}
          <ToggleRow
            label="Champ obligatoire"
            hint={`Par défaut : ${entry.defaultRequired ? "oui" : "non"}`}
            checked={required}
            disabled={hidden}
            onChange={setRequired}
          />

          {/* ── Hidden toggle ── */}
          <ToggleRow
            label="Masquer ce champ"
            hint="Si activé, ce champ disparaît entièrement du dossier parent. Le champ « obligatoire » devient sans effet."
            checked={hidden}
            onChange={(v) => {
              setHidden(v);
              if (v) setRequired(false);
            }}
          />
        </div>

        <SheetFooter className="mt-8 flex flex-row-reverse items-center justify-between gap-2 border-t border-[color:var(--color-border-subtle)] pt-4 sm:flex-row-reverse">
          <Button onClick={onSave} disabled={pending} className="gap-2">
            {pendingSave ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            Enregistrer
          </Button>
          <Button
            variant="ghost"
            onClick={onReset}
            disabled={!hasOverride || pending}
            className="gap-2 text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger-soft)] hover:text-[color:var(--color-danger)]"
            title={
              hasOverride
                ? "Réinitialiser ce champ aux valeurs par défaut"
                : "Aucune personnalisation à réinitialiser"
            }
          >
            {pendingReset ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="size-4" aria-hidden />
            )}
            Réinitialiser
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={
        "flex items-start justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-3 " +
        (disabled ? "opacity-50" : "cursor-pointer hover:bg-[color:var(--color-surface-hover)]")
      }
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[color:var(--color-foreground)]">
          {label}
        </p>
        {hint ? (
          <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
            {hint}
          </p>
        ) : null}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 rounded border-[color:var(--color-border-strong)]"
      />
    </label>
  );
}
