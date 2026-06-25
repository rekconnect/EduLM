"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import type {
  ResolvedField,
  TenantInscriptionFormConfig,
  DossierLocale,
} from "@/lib/inscription-fields-resolver";
import { DOSSIER_TABS, type DossierTab } from "@/lib/dossier-tabs";
import { FieldsConfigForm } from "./_fields-config";
import { RegistryTabEditor } from "./_registry-tab-editor";
import { ParentCreateFieldsForm } from "./_parent-create-fields";
import { StudentCreateFieldsForm } from "./_student-create-fields";

type Context = "inscription" | "admission";

/**
 * How each parent dossier tab is edited:
 *  - "live"     → the tab renders from the entity-fields config (System A);
 *                 full editing here (add/remove/reorder/type/options/show-if).
 *  - "registry" → the tab is a hardcoded component (System B); its fields are
 *                 registered in inscription-fields-registry, so we surface them
 *                 for label / required / hidden control (RegistryTabEditor),
 *                 keeping the polished component + its logic intact.
 * Ordered + labelled to mirror exactly what the parent sees (DOSSIER_TABS +
 * the `dossier.tab.*` labels).
 */
type InscTabKind = "live" | "registry";
type InscTabDef = {
  id: DossierTab;
  entity?: "student" | "parent";
  /** Category names to scope a "live" editor to; omitted = all (Responsables). */
  cats?: string[];
  kind: InscTabKind;
};

const ELEVE_TAB: InscTabDef = {
  id: "eleve",
  entity: "student",
  cats: ["Info générale", "Info Arabe"],
  kind: "live",
};

const INSCRIPTION_TABS: InscTabDef[] = [
  ELEVE_TAB,
  { id: "responsables", entity: "parent", kind: "live" },
  { id: "foyer", entity: "student", cats: ["Foyer"], kind: "live" },
  { id: "scolarite", kind: "registry" },
  { id: "sante", entity: "student", cats: ["Santé"], kind: "live" },
  { id: "transport", entity: "student", cats: ["Services"], kind: "live" },
  { id: "autorisations", entity: "student", cats: ["Autorisations"], kind: "live" },
  { id: "contacts", entity: "student", cats: ["Contacts"], kind: "live" },
  { id: "finance", kind: "registry" },
  { id: "justificatifs", kind: "registry" },
  { id: "validation", kind: "registry" },
];

/**
 * Form-field editor, split by CONTEXT:
 *   Inscription → laid out as the parent's dossier tabs (Élève, Responsables,
 *     Foyer, …) so the admin configures fields in the same structure the parent
 *     sees. "live" tabs use the rich config editor; "registry" tabs surface the
 *     hardcoded fields for label/required/hidden control. Admin-only fields are
 *     badged.
 *   Admission   → Ajouter un parent / Ajouter un élève (admin quick-create).
 */
export function FieldsEditorTabs({
  studentInitial,
  parentInitial,
  parentCreateInitial,
  studentCreateInitial,
  registryFields,
  registryConfig,
  registryLocale,
}: {
  studentInitial: EntityFieldsConfig;
  parentInitial: EntityFieldsConfig;
  parentCreateInitial:
    | React.ComponentProps<typeof ParentCreateFieldsForm>["initial"]
    | null;
  studentCreateInitial:
    | React.ComponentProps<typeof StudentCreateFieldsForm>["initial"]
    | null;
  /** Resolved System-B fields per hardcoded tab (for the clickable list). */
  registryFields: Record<string, ResolvedField[]>;
  /** Tenant inscription-form config + locale for the field-edit drawer. */
  registryConfig: TenantInscriptionFormConfig;
  registryLocale: DossierLocale;
}) {
  const t = useTranslations("settings");
  const tDossier = useTranslations("dossier");
  const [ctx, setCtx] = useState<Context>("inscription");
  const [insTab, setInsTab] = useState<DossierTab>("eleve");
  const [admTab, setAdmTab] = useState<"parent" | "student">("parent");

  const active =
    INSCRIPTION_TABS.find((x) => x.id === insTab) ?? ELEVE_TAB;

  const parentFieldOptions = parentInitial.fields.map((f) => ({
    key: f.key,
    label: f.label,
  }));

  return (
    <div className="space-y-5">
      {/* ── Context switch: Inscription vs Admission ── */}
      <div className="inline-flex rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-0.5 text-sm">
        {(["inscription", "admission"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCtx(c)}
            className={cn(
              "rounded px-4 py-1.5 font-medium transition-colors duration-150 ease-out",
              ctx === c
                ? "bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground)] shadow-card"
                : "text-[color:var(--color-foreground-muted)] hover:text-[color:var(--color-foreground)]",
            )}
          >
            {t(c === "inscription" ? "fieldsConfig.ctxInscription" : "fieldsConfig.ctxAdmission")}
          </button>
        ))}
      </div>

      {ctx === "inscription" ? (
        <div className="space-y-3">
          <p className="text-xs text-[color:var(--color-foreground-subtle)]">
            {t("fieldsConfig.layoutHint")}
          </p>

          {/* Parent-dossier tab strip — same order + labels as the parent. */}
          <div className="flex flex-wrap gap-1 border-b border-[color:var(--color-border-subtle)]">
            {INSCRIPTION_TABS.map((tb) => {
              const isActive = tb.id === insTab;
              return (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setInsTab(tb.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out",
                    isActive
                      ? "border-[color:var(--color-brand-600)] text-[color:var(--color-foreground)]"
                      : "border-transparent text-[color:var(--color-foreground-muted)] hover:text-[color:var(--color-foreground)]",
                  )}
                >
                  {tDossier(`tab.${tb.id}`)}
                </button>
              );
            })}
          </div>

          {/* Active tab. "live" tabs use the rich config editor (student tabs
              share one mounted instance so switching keeps unsaved edits);
              "registry" tabs surface System-B label/required/hidden controls. */}
          {active.kind === "registry" ? (
            <RegistryTabEditor
              fields={registryFields[active.id] ?? []}
              config={registryConfig}
              locale={registryLocale}
            />
          ) : active.entity === "parent" ? (
            <FieldsConfigForm key="parent" entity="parent" initial={parentInitial} />
          ) : (
            <FieldsConfigForm
              key="student"
              entity="student"
              initial={studentInitial}
              parentFieldOptions={parentFieldOptions}
              visibleCategoryNames={active.cats?.length ? active.cats : undefined}
            />
          )}
        </div>
      ) : (
        <>
          <SubTabs
            value={admTab}
            onChange={(v) => setAdmTab(v as "parent" | "student")}
            tabs={[
              { id: "parent", label: t("fieldsConfig.tabAddParent") },
              { id: "student", label: t("fieldsConfig.tabAddStudent") },
            ]}
          />
          {admTab === "parent" ? (
            parentCreateInitial ? (
              <ParentCreateFieldsForm initial={parentCreateInitial} />
            ) : (
              <p className="text-sm text-[color:var(--color-foreground-muted)]">
                {t("fieldsConfig.addParentDesc")}
              </p>
            )
          ) : studentCreateInitial ? (
            <StudentCreateFieldsForm initial={studentCreateInitial} />
          ) : (
            <p className="text-sm text-[color:var(--color-foreground-muted)]">
              {t("fieldsConfig.addParentDesc")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SubTabs({
  value,
  onChange,
  tabs,
}: {
  value: string;
  onChange: (v: string) => void;
  tabs: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-[color:var(--color-border-subtle)]">
      {tabs.map((tb) => (
        <button
          key={tb.id}
          type="button"
          onClick={() => onChange(tb.id)}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out",
            value === tb.id
              ? "border-[color:var(--color-brand-600)] text-[color:var(--color-foreground)]"
              : "border-transparent text-[color:var(--color-foreground-muted)] hover:text-[color:var(--color-foreground)]",
          )}
        >
          {tb.label}
        </button>
      ))}
    </div>
  );
}
