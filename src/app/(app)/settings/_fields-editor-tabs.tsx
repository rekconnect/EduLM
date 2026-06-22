"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { FieldsConfigForm } from "./_fields-config";
import { ParentCreateFieldsForm } from "./_parent-create-fields";

type Context = "inscription" | "admission";

/**
 * Form-field editor, split by CONTEXT (like the inscription vs admission
 * sides), each with its own sub-tabs:
 *   Inscription → Élève / Parents  (the online dossier the parent fills)
 *   Admission   → Ajouter un parent / Ajouter un élève  (admin quick-create)
 * Keeping the two apart matches how they're actually used — a full dossier vs
 * a few fields to spin up a record.
 */
export function FieldsEditorTabs({
  studentInitial,
  parentInitial,
  parentCreateInitial,
}: {
  studentInitial: EntityFieldsConfig;
  parentInitial: EntityFieldsConfig;
  parentCreateInitial:
    | React.ComponentProps<typeof ParentCreateFieldsForm>["initial"]
    | null;
}) {
  const t = useTranslations("settings");
  const [ctx, setCtx] = useState<Context>("inscription");
  const [insTab, setInsTab] = useState<"eleve" | "parents">("eleve");
  const [admTab, setAdmTab] = useState<"parent" | "student">("parent");

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
        <>
          <SubTabs
            value={insTab}
            onChange={(v) => setInsTab(v as "eleve" | "parents")}
            tabs={[
              { id: "eleve", label: t("fieldsConfig.tabStudent") },
              { id: "parents", label: t("fieldsConfig.tabParent") },
            ]}
          />
          {insTab === "eleve" ? (
            <FieldsConfigForm entity="student" initial={studentInitial} />
          ) : (
            <FieldsConfigForm entity="parent" initial={parentInitial} />
          )}
        </>
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
          ) : (
            <div className="rounded-md border border-dashed border-[color:var(--color-border-strong)] px-4 py-6 text-center text-sm text-[color:var(--color-foreground-muted)]">
              {t("fieldsConfig.addStudentSoon")}
            </div>
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
