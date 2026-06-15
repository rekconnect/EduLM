"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Briefcase,
  FileCheck2,
  FileText,
  GraduationCap,
  Heart,
  Home,
  Loader2,
  Save,
  ShieldCheck,
  User as UserIcon,
  Users,
  Bus,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DOSSIER_TABS, type DossierTab, type TabsConfig } from "@/lib/dossier-tabs";
import { updateInscriptionTabsConfig } from "./_actions";

const TAB_ICONS: Record<DossierTab, LucideIcon> = {
  eleve: UserIcon,
  responsables: Users,
  foyer: Home,
  scolarite: GraduationCap,
  sante: Stethoscope,
  transport: Bus,
  autorisations: ShieldCheck,
  contacts: Heart,
  finance: Briefcase,
  justificatifs: FileText,
  validation: FileCheck2,
};

const ALWAYS_ON: ReadonlyArray<DossierTab> = ["eleve", "responsables", "validation"];

/**
 * Tab-visibility editor for the dossier. Three of the ten tabs are
 * marked as core (Élève / Responsables / Validation) — admin can
 * still toggle them off, but the UI warns that the parent flow needs
 * them and a future enhancement may enforce this.
 */
export function InscriptionTabsForm({ initial }: { initial: TabsConfig }) {
  const t = useTranslations("inscriptionConfig");
  const tDossier = useTranslations("dossier");
  const tCommon = useTranslations("common");
  const [config, setConfig] = useState<TabsConfig>(initial);
  const [pending, startTransition] = useTransition();

  function toggle(tab: DossierTab) {
    setConfig((prev) => ({ ...prev, [tab]: !prev[tab] }));
  }

  function onSave() {
    const fd = new FormData();
    for (const tab of DOSSIER_TABS) {
      if (config[tab]) fd.set(`tab-${tab}`, "on");
    }
    startTransition(async () => {
      const r = await updateInscriptionTabsConfig(fd);
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  return (
    <Card>
      <CardHeader title={t("tabs.title")} description={t("tabs.hint")} />
      <CardBody className="space-y-3">
        {DOSSIER_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          const isCore = ALWAYS_ON.includes(tab);
          return (
            <label
              key={tab}
              className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-4 py-3"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[color:var(--color-foreground)]">
                    {tDossier(`tab.${tab}` as never)}
                  </span>
                  {isCore ? (
                    <span className="block text-xs text-[color:var(--color-foreground-muted)]">
                      {t("tabs.coreHint")}
                    </span>
                  ) : null}
                </span>
              </span>
              <input
                type="checkbox"
                checked={config[tab]}
                onChange={() => toggle(tab)}
                className="size-4"
              />
            </label>
          );
        })}

        <div className="flex justify-end pt-2">
          <Button type="button" onClick={onSave} disabled={pending} className="gap-2">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {pending ? tCommon("saving") : tCommon("save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
