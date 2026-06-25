"use client";

import { useTranslations } from "next-intl";
import { Pencil, EyeOff } from "lucide-react";
import { TenantConfigProvider } from "@/components/dossier/tenant-config-context";
import {
  PreviewEditModeProvider,
  usePreviewEditMode,
} from "@/components/dossier/preview-edit-mode-context";
import { FieldEditDrawer } from "@/components/dossier/field-edit-drawer";
import type {
  ResolvedField,
  TenantInscriptionFormConfig,
  DossierLocale,
} from "@/lib/inscription-fields-resolver";

/**
 * Unified-editor view for a HARDCODED parent tab (Scolarité, Foyer, Santé,
 * Finance, Contacts…). These tabs render bespoke components with embedded
 * logic, so they can't be field-config-driven — but every field is registered
 * in inscription-fields-registry (System B). This lists them as compact rows;
 * clicking one opens the shared FieldEditDrawer (the WYSIWYG editor's panel:
 * FR/EN/AR locale tabs + required + hidden + reset). Writes go through the same
 * saveFieldOverride/resetFieldOverride into Tenant.inscriptionFormConfig — so
 * this and the visual WYSIWYG stay perfectly consistent.
 */
export function RegistryTabEditor({
  fields,
  config,
  locale,
}: {
  fields: ResolvedField[];
  config: TenantInscriptionFormConfig;
  locale: DossierLocale;
}) {
  const t = useTranslations("settings");

  if (fields.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-sunken)] px-4 py-6 text-center text-sm text-[color:var(--color-foreground-muted)]">
        {t("fieldsConfig.registryEmpty")}
      </p>
    );
  }

  return (
    <TenantConfigProvider config={config} locale={locale}>
      <PreviewEditModeProvider>
        <RegistryList fields={fields} />
        <FieldEditDrawer />
      </PreviewEditModeProvider>
    </TenantConfigProvider>
  );
}

function RegistryList({ fields }: { fields: ResolvedField[] }) {
  const t = useTranslations("settings");
  const { setActiveFieldKey } = usePreviewEditMode();

  // Section headers in registry order.
  const rows: Array<
    { kind: "section"; label: string } | { kind: "field"; field: ResolvedField }
  > = [];
  let lastSection = "";
  for (const f of fields) {
    const sec = `${f.section}${f.subSection ? ` · ${f.subSection}` : ""}`;
    if (sec !== lastSection) {
      rows.push({ kind: "section", label: sec });
      lastSection = sec;
    }
    rows.push({ kind: "field", field: f });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[color:var(--color-foreground-subtle)]">
        {t("fieldsConfig.registryHint")}
      </p>
      <ul className="space-y-1.5">
        {rows.map((r, i) =>
          r.kind === "section" ? (
            <li
              key={`s-${i}`}
              className="px-1 pt-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]"
            >
              {r.label}
            </li>
          ) : (
            <li key={r.field.key}>
              <button
                type="button"
                onClick={() => setActiveFieldKey(r.field.key)}
                className="group flex w-full items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-2 text-start transition-colors hover:border-[color:var(--color-brand-400)] hover:bg-[color:var(--color-surface-sunken)]"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-[color:var(--color-foreground)]">
                      {r.field.label}
                    </span>
                    {r.field.required ? (
                      <span
                        className="text-[color:var(--color-danger)]"
                        title={t("fieldsConfig.required")}
                      >
                        *
                      </span>
                    ) : null}
                    {r.field.hidden ? (
                      <EyeOff
                        className="size-3.5 text-[color:var(--color-foreground-subtle)]"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-[color:var(--color-foreground-subtle)]">
                    {r.field.key}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.field.hasOverride ? (
                    <span className="rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-brand-600)]">
                      {t("fieldsConfig.badgeOverridden")}
                    </span>
                  ) : null}
                  <Pencil
                    className="size-3.5 text-[color:var(--color-foreground-subtle)] opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
