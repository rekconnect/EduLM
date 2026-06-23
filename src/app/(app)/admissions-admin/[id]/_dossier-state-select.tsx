"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { DOSSIER_STATES, type DossierState } from "@/lib/dossier-state";
import { setDossierState } from "../_actions";

/**
 * Admin control to set a single dossier's state (services gate + editability):
 * Ouvert / Services masqués / Services ouverts / Consultation. Overrides the
 * tenant default for that dossier.
 */
export function DossierStateSelect({
  applicationId,
  current,
}: {
  applicationId: string;
  current: DossierState;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [pending, start] = useTransition();

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-[color:var(--color-foreground)]">
        {t("dossierStateLabel")}
      </span>
      <Select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          start(async () => {
            const r = await setDossierState(applicationId, v);
            if (r.ok) toast.success(tCommon("saved"));
            else toast.error(tCommon("error"));
          });
        }}
      >
        {DOSSIER_STATES.map((s) => (
          <option key={s} value={s} title={t(`dossierStateHint.${s}` as never)}>
            {t(`dossierState.${s}` as never)}
          </option>
        ))}
      </Select>
      <span className="text-xs text-[color:var(--color-foreground-muted)]">
        {t(`dossierStateHint.${current}` as never)}
      </span>
    </label>
  );
}
