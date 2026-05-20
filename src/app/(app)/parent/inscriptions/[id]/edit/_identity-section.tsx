"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { updateDossierCore } from "../../_actions";

export type EstablishmentForIdentity = {
  id: string;
  name: string;
  levels: string[];
};

type State = {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
};

export function DossierIdentitySection({
  applicationId,
  initial,
  establishments,
  disabled,
}: {
  applicationId: string;
  initial: {
    childFirstName: string;
    childLastName: string;
    childDob: string;
    establishmentId: string;
    niveau: string;
  };
  establishments: EstablishmentForIdentity[];
  disabled: boolean;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const bound = updateDossierCore.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (prev, fd) => {
      const result = await bound(prev, fd);
      if (result.ok) toast.success(t("dossierSavedToast"));
      else if (result.error) toast.error(t(`dossierError_${result.error}` as never));
      return result;
    },
    {},
  );

  const [establishmentId, setEstablishmentId] = useState(initial.establishmentId);
  const selectedEst = useMemo(
    () => establishments.find((e) => e.id === establishmentId),
    [establishmentId, establishments],
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field
          label={t("dossierFieldLastName")}
          htmlFor="childLastName"
          required
          error={state.errors?.childLastName}
        >
          <Input
            id="childLastName"
            name="childLastName"
            required
            defaultValue={initial.childLastName}
            maxLength={80}
            disabled={disabled}
          />
        </Field>
        <Field
          label={t("dossierFieldFirstName")}
          htmlFor="childFirstName"
          required
          error={state.errors?.childFirstName}
        >
          <Input
            id="childFirstName"
            name="childFirstName"
            required
            defaultValue={initial.childFirstName}
            maxLength={80}
            disabled={disabled}
          />
        </Field>
      </FormRow>

      <Field
        label={t("dossierFieldDob")}
        htmlFor="childDob"
        required
        error={state.errors?.childDob}
      >
        <Input
          id="childDob"
          name="childDob"
          type="date"
          required
          defaultValue={initial.childDob}
          disabled={disabled}
        />
      </Field>

      <FormRow>
        <Field
          label={t("dossierFieldEstablishment")}
          htmlFor="establishmentId"
          required={establishments.length > 0}
          error={state.errors?.establishmentId}
        >
          <Select
            id="establishmentId"
            name="establishmentId"
            value={establishmentId}
            onChange={(e) => setEstablishmentId(e.target.value)}
            required={establishments.length > 0}
            disabled={disabled || establishments.length === 0}
          >
            <option value="">—</option>
            {establishments.map((est) => (
              <option key={est.id} value={est.id}>
                {est.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t("dossierFieldNiveau")}
          htmlFor="niveau"
          required
          error={state.errors?.niveau}
        >
          {selectedEst && selectedEst.levels.length > 0 ? (
            <Select
              id="niveau"
              name="niveau"
              required
              defaultValue={initial.niveau}
              disabled={disabled || !establishmentId}
            >
              <option value="">—</option>
              {selectedEst.levels.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id="niveau"
              name="niveau"
              required
              defaultValue={initial.niveau}
              maxLength={40}
              disabled={disabled || (establishments.length > 0 && !establishmentId)}
            />
          )}
        </Field>
      </FormRow>

      {!disabled ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} variant="secondary" className="gap-2">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pending ? tCommon("loading") : t("dossierSaveSection")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
