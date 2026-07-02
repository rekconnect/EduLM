"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { FieldsRenderer, type FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { scolariteGatingAnswers } from "@/lib/scolarite-config";
import { saveScolariteTab } from "../../_actions";

export type EstablishmentForScolarite = {
  id: string;
  name: string;
  levels: string[];
};

/**
 * Scolarité tab — config-native edition (last hardcoded parent tab migrated).
 *
 * Hybrid layout:
 *   - Établissement + Niveau stay STRUCTURAL selects (they write the
 *     Application.establishmentId / niveau columns, and the establishment_ref
 *     config type would store the *name*, not the id we need). The niveau also
 *     drives the niveau-conditional sections.
 *   - Everything else (Parcours, EBEP, Options pédagogiques, Souhait) renders
 *     from the studentFieldsConfig "Scolarité (dossier)" categories via the
 *     shared FieldsRenderer.
 *
 * Gating: the niveau (a raw, tenant-defined string) is normalised by
 * `scolariteGatingAnswers` into two synthetic answers (`__niveauGroup`,
 * `__firstYear`) that the seeded showIf/hideIf rules reference. These are
 * injected only into the render answers — never persisted.
 *
 * On save the flat config answers are rebuilt into the canonical nested
 * `dossierAnswers.scolarite` + `.pedagogique` stores by `saveScolariteTab`, so
 * the admissions review + acceptance bridge stay untouched.
 */
export function DossierTabScolarite({
  applicationId,
  config,
  initial,
  initialEstablishmentId,
  initialNiveau,
  establishments,
  disabled,
}: {
  applicationId: string;
  config: EntityFieldsConfig;
  initial: FieldAnswers;
  initialEstablishmentId: string;
  initialNiveau: string;
  establishments: EstablishmentForScolarite[];
  disabled: boolean;
}) {
  const [answers, setAnswers] = useState<FieldAnswers>(initial);
  const [establishmentId, setEstablishmentId] = useState<string>(
    initialEstablishmentId,
  );
  const [niveau, setNiveau] = useState<string>(initialNiveau);
  const [pending, start] = useTransition();

  const selectedEst = useMemo(
    () => establishments.find((e) => e.id === establishmentId),
    [establishmentId, establishments],
  );

  // Real answers + the (non-persisted) niveau gating answers, recomputed
  // whenever the niveau select changes so showIf/hideIf re-evaluate live.
  const renderAnswers = useMemo(
    () => ({ ...answers, ...scolariteGatingAnswers(niveau) }),
    [answers, niveau],
  );

  function onSave() {
    start(async () => {
      const r = await saveScolariteTab(applicationId, {
        answers,
        establishmentId: establishmentId || undefined,
        niveau: niveau || undefined,
      });
      if (r.ok) toast.success("Enregistré");
      else toast.error("Échec de l'enregistrement");
    });
  }

  return (
    <div className="space-y-6">
      {/* Structural wishlist — establishment + niveau (Application columns). */}
      <Card>
        <CardHeader title="Niveau souhaité" />
        <CardBody>
          <FormRow>
            <Field
              label="Établissement"
              htmlFor="establishmentId"
              required={establishments.length > 0}
            >
              <Select
                id="establishmentId"
                value={establishmentId}
                onChange={(e) => {
                  setEstablishmentId(e.target.value);
                  setNiveau("");
                }}
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
            <Field label="Niveau" htmlFor="niveau" required>
              {selectedEst && selectedEst.levels.length > 0 ? (
                <Select
                  id="niveau"
                  value={niveau}
                  onChange={(e) => setNiveau(e.target.value)}
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
                  value={niveau}
                  onChange={(e) => setNiveau(e.target.value)}
                  maxLength={40}
                  disabled={
                    disabled || (establishments.length > 0 && !establishmentId)
                  }
                />
              )}
            </Field>
          </FormRow>
        </CardBody>
      </Card>

      {/* Config-driven sections (Souhait / Parcours / EBEP / Pédagogie),
          niveau-gated via the injected synthetic answers. */}
      <Card>
        <CardBody>
          <FieldsRenderer
            config={config}
            answers={renderAnswers}
            extras={{ establishments: [] }}
            disabled={disabled}
            unlockBound
            onChange={(id, value) =>
              setAnswers((p) => ({ ...p, [id]: value }))
            }
          />
        </CardBody>
      </Card>

      {!disabled ? (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
