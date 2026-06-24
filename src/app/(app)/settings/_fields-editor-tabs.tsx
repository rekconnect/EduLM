"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { DOSSIER_TABS, type DossierTab } from "@/lib/dossier-tabs";
import { FieldsConfigForm } from "./_fields-config";
import { ParentCreateFieldsForm } from "./_parent-create-fields";
import { StudentCreateFieldsForm } from "./_student-create-fields";

type Context = "inscription" | "admission";

/**
 * How each parent dossier tab maps onto the field config:
 *  - "live"      → rendered to the parent from config; full editor here.
 *  - "orphan"    → config fields exist, but the parent still shows a HARDCODED
 *                  version of the tab, so edits here don't reach the parent yet.
 *  - "hardcoded" → no field config at all; configured in code (labels can be
 *                  overridden via the legacy WYSIWYG editor).
 * Ordered + labelled to mirror exactly what the parent sees (DOSSIER_TABS +
 * the `dossier.tab.*` labels).
 */
type InscTabKind = "live" | "orphan" | "hardcoded";
type InscTabDef = {
  id: DossierTab;
  entity?: "student" | "parent";
  /** Category names to scope the editor to; empty/omitted = all (Responsables). */
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
  { id: "foyer", kind: "hardcoded" },
  {
    id: "scolarite",
    entity: "student",
    cats: ["Scolarité", "Renseignements pédagogiques"],
    kind: "orphan",
  },
  { id: "sante", kind: "hardcoded" },
  { id: "transport", entity: "student", cats: ["Services"], kind: "orphan" },
  { id: "autorisations", entity: "student", cats: ["Autorisations"], kind: "live" },
  { id: "contacts", kind: "hardcoded" },
  { id: "finance", kind: "hardcoded" },
  { id: "justificatifs", kind: "hardcoded" },
  { id: "validation", kind: "hardcoded" },
];

/**
 * Form-field editor, split by CONTEXT:
 *   Inscription → laid out as the parent's dossier tabs (Élève, Responsables,
 *     Foyer, …) so the admin configures fields in the same structure the parent
 *     sees. Same rich/conditional editor; admin-only fields are badged.
 *   Admission   → Ajouter un parent / Ajouter un élève (admin quick-create).
 */
export function FieldsEditorTabs({
  studentInitial,
  parentInitial,
  parentCreateInitial,
  studentCreateInitial,
}: {
  studentInitial: EntityFieldsConfig;
  parentInitial: EntityFieldsConfig;
  parentCreateInitial:
    | React.ComponentProps<typeof ParentCreateFieldsForm>["initial"]
    | null;
  studentCreateInitial:
    | React.ComponentProps<typeof StudentCreateFieldsForm>["initial"]
    | null;
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
                  title={
                    tb.kind === "orphan"
                      ? t("fieldsConfig.statusOrphan")
                      : tb.kind === "hardcoded"
                        ? t("fieldsConfig.statusHardcoded")
                        : undefined
                  }
                  className={cn(
                    "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out",
                    isActive
                      ? "border-[color:var(--color-brand-600)] text-[color:var(--color-foreground)]"
                      : "border-transparent text-[color:var(--color-foreground-muted)] hover:text-[color:var(--color-foreground)]",
                    tb.kind === "hardcoded" && !isActive && "opacity-60",
                  )}
                >
                  {tDossier(`tab.${tb.id}`)}
                  {tb.kind === "orphan" ? (
                    <span className="rounded bg-[color:var(--color-surface-sunken)] px-1 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                      {t("fieldsConfig.badgeOrphan")}
                    </span>
                  ) : null}
                  {tb.kind === "hardcoded" ? (
                    <Lock
                      className="size-3 text-[color:var(--color-foreground-subtle)]"
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Active tab content. Student-entity tabs keep one mounted instance
              (key="student") so switching between them doesn't lose unsaved
              edits; Responsables mounts the parent editor. */}
          {active.kind === "hardcoded" ? (
            <HardcodedNotice label={tDossier(`tab.${active.id}`)} />
          ) : active.entity === "parent" ? (
            <FieldsConfigForm key="parent" entity="parent" initial={parentInitial} />
          ) : (
            <FieldsConfigForm
              key="student"
              entity="student"
              initial={studentInitial}
              parentFieldOptions={parentFieldOptions}
              visibleCategoryNames={active.cats?.length ? active.cats : undefined}
              notice={active.kind === "orphan" ? <OrphanNotice /> : undefined}
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

/** Amber-quiet banner: config exists but the parent still sees a hardcoded tab. */
function OrphanNotice() {
  const t = useTranslations("settings");
  return (
    <div className="rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-sunken)] px-3 py-2 text-xs text-[color:var(--color-foreground-muted)]">
      {t("fieldsConfig.orphanNotice")}
    </div>
  );
}

/** Tab that isn't field-config-driven yet — pointer to the legacy WYSIWYG. */
function HardcodedNotice({ label }: { label: string }) {
  const t = useTranslations("settings");
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-sunken)] p-6 text-center">
      <p className="mx-auto max-w-md text-sm text-[color:var(--color-foreground-muted)]">
        {t("fieldsConfig.hardcodedNotice", { tab: label })}
      </p>
      <Link
        href="/admin/inscription-config/preview"
        className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-3 py-1.5 text-sm font-semibold text-[color:var(--color-foreground-onbrand)] transition-colors hover:bg-[color:var(--color-brand-700)]"
      >
        {t("fieldsConfig.hardcodedNoticeCta")}
      </Link>
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
