"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { FieldsConfigForm } from "./_fields-config";
import { ParentCreateFieldsForm } from "./_parent-create-fields";

type Tab = "eleve" | "parents" | "parentCreate";

/**
 * One field editor with horizontal tabs on top (Élève / Parents / Création de
 * compte), mirroring the inscription form's tab layout — instead of separate
 * stacked sections. More tabs (Foyer, Scolarité, …) join here as those parts
 * of the form migrate to the config-driven system.
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
  const [tab, setTab] = useState<Tab>("eleve");

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "eleve", label: t("fieldsConfig.tabStudent") },
    { id: "parents", label: t("fieldsConfig.tabParent") },
    ...(parentCreateInitial
      ? [{ id: "parentCreate" as Tab, label: t("fieldsConfig.tabParentCreate") }]
      : []),
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-[color:var(--color-border-subtle)]">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out",
              tab === tb.id
                ? "border-[color:var(--color-brand-600)] text-[color:var(--color-foreground)]"
                : "border-transparent text-[color:var(--color-foreground-muted)] hover:text-[color:var(--color-foreground)]",
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "eleve" ? (
        <FieldsConfigForm entity="student" initial={studentInitial} />
      ) : null}
      {tab === "parents" ? (
        <FieldsConfigForm entity="parent" initial={parentInitial} />
      ) : null}
      {tab === "parentCreate" && parentCreateInitial ? (
        <ParentCreateFieldsForm initial={parentCreateInitial} />
      ) : null}
    </div>
  );
}
