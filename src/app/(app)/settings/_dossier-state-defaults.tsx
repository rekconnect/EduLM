"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { DOSSIER_STATES } from "@/lib/dossier-state";
import { updateDossierStateDefaults } from "./_actions";

/**
 * Global per-context default for the dossier "state" (services gate +
 * editability). Each new/renewal dossier starts in the chosen state; the admin
 * can override it per dossier from the admission review.
 */
export function DossierStateDefaultsForm({
  initial,
}: {
  initial: { inscription: string; renewal: string };
}) {
  const t = useTranslations("settings");
  const tAdm = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [pending, start] = useTransition();
  const [inscription, setInscription] = useState(initial.inscription);
  const [renewal, setRenewal] = useState(initial.renewal);

  function onSubmit() {
    const fd = new FormData();
    fd.set("inscription", inscription);
    fd.set("renewal", renewal);
    start(async () => {
      const r = await updateDossierStateDefaults(fd);
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(tCommon("error"));
    });
  }

  return (
    <div className="space-y-4">
      <FormRow>
        <Field label={t("dossierDefaults.inscription")} htmlFor="dsd-inscription">
          <Select
            id="dsd-inscription"
            value={inscription}
            onChange={(e) => setInscription(e.target.value)}
          >
            {DOSSIER_STATES.map((s) => (
              <option
                key={s}
                value={s}
                title={tAdm(`dossierStateHint.${s}` as never)}
              >
                {tAdm(`dossierState.${s}` as never)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("dossierDefaults.renewal")} htmlFor="dsd-renewal">
          <Select
            id="dsd-renewal"
            value={renewal}
            onChange={(e) => setRenewal(e.target.value)}
          >
            {DOSSIER_STATES.map((s) => (
              <option
                key={s}
                value={s}
                title={tAdm(`dossierStateHint.${s}` as never)}
              >
                {tAdm(`dossierState.${s}` as never)}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <div className="flex justify-end">
        <Button type="button" onClick={onSubmit} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
              {tCommon("saving")}
            </>
          ) : (
            tCommon("save")
          )}
        </Button>
      </div>
    </div>
  );
}
