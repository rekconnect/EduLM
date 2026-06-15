"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Phone,
  Plus,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteResponsable, saveResponsable } from "../../_actions";

export type ResponsableRow = {
  id: string;
  kind: "PERE" | "MERE" | "TUTEUR" | "AUTRE";
  civility: string | null;
  firstName: string | null;
  lastName: string | null;
  firstNameAr: string | null;
  lastNameAr: string | null;
  isLebanese: boolean | null;
  nationality1: string | null;
  email: string | null;
  phoneMobile: string | null;
  phoneHome: string | null;
  profession: string | null;
  employer: string | null;
};

const KIND_LABEL: Record<ResponsableRow["kind"], string> = {
  PERE: "Père",
  MERE: "Mère",
  TUTEUR: "Tuteur / Tutrice",
  AUTRE: "Autre",
};

/**
 * Responsables légaux — multi-row editor (père / mère / tuteur). Each row is
 * an ApplicationResponsable. Prefilled on renewal from the family's guardians.
 * Sits at the top of the Responsables tab, above the submitter sections.
 */
export function DossierResponsablesList({
  applicationId,
  initial,
  disabled,
}: {
  applicationId: string;
  initial: ResponsableRow[];
  disabled: boolean;
}) {
  const [editing, setEditing] = useState<
    { mode: "new" } | { mode: "edit"; row: ResponsableRow } | null
  >(null);

  return (
    <Card>
      <CardHeader
        title="Responsables légaux"
        description="Père, mère ou tuteur. Vérifiez les informations pré-remplies et complétez si besoin."
      />
      <CardBody className="space-y-3">
        {initial.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-6 text-center text-sm text-[color:var(--color-foreground-muted)]">
            Aucun responsable enregistré.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {initial.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ mode: "edit", row: r })}
                  className="group flex w-full items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-3 text-left transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-sunken)]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                    <UserIcon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[color:var(--color-foreground)] group-hover:text-[color:var(--color-brand-600)]">
                      {[r.civility, r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}
                    </p>
                    <p className="truncate text-xs text-[color:var(--color-foreground-muted)]">
                      {KIND_LABEL[r.kind]}
                    </p>
                    {r.phoneMobile || r.phoneHome || r.email ? (
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-[color:var(--color-foreground-muted)]">
                        <Phone className="size-3" aria-hidden />
                        {r.phoneMobile || r.phoneHome || r.email}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!disabled ? (
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing({ mode: "new" })}
              className="gap-1.5"
            >
              <Plus className="size-4" aria-hidden />
              Ajouter un responsable
            </Button>
          </div>
        ) : null}
      </CardBody>

      {editing ? (
        <ResponsableDialog
          applicationId={applicationId}
          mode={editing.mode}
          initial={editing.mode === "edit" ? editing.row : null}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function ResponsableDialog({
  applicationId,
  mode,
  initial,
  onClose,
}: {
  applicationId: string;
  mode: "new" | "edit";
  initial: ResponsableRow | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [removing, startRemove] = useTransition();
  const [kind, setKind] = useState<ResponsableRow["kind"]>(initial?.kind ?? "PERE");
  const [civility, setCivility] = useState(initial?.civility ?? "");
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [firstNameAr, setFirstNameAr] = useState(initial?.firstNameAr ?? "");
  const [lastNameAr, setLastNameAr] = useState(initial?.lastNameAr ?? "");
  const [isLebanese, setIsLebanese] = useState<boolean | null>(initial?.isLebanese ?? null);
  const [nationality1, setNationality1] = useState(initial?.nationality1 ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phoneMobile, setPhoneMobile] = useState(initial?.phoneMobile ?? "");
  const [phoneHome, setPhoneHome] = useState(initial?.phoneHome ?? "");
  const [profession, setProfession] = useState(initial?.profession ?? "");
  const [employer, setEmployer] = useState(initial?.employer ?? "");
  const [error, setError] = useState<string | null>(null);

  function onSubmit() {
    if (!lastName.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await saveResponsable(
        applicationId,
        mode === "edit" && initial ? initial.id : null,
        {
          kind,
          civility: civility || undefined,
          firstName: firstName || undefined,
          lastName,
          firstNameAr: firstNameAr || undefined,
          lastNameAr: lastNameAr || undefined,
          isLebanese,
          nationality1: nationality1 || undefined,
          email: email || undefined,
          phoneMobile: phoneMobile || undefined,
          phoneHome: phoneHome || undefined,
          profession: profession || undefined,
          employer: employer || undefined,
        },
      );
      if (r.ok) {
        toast.success("Enregistré");
        onClose();
      } else {
        setError("Échec de l'enregistrement.");
      }
    });
  }

  function onDelete() {
    if (!initial) return;
    startRemove(async () => {
      const r = await deleteResponsable(applicationId, initial.id);
      if (r.ok) {
        toast.success("Responsable supprimé");
        onClose();
      } else {
        setError("Échec de la suppression.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit"
              ? `${initial?.firstName ?? ""} ${initial?.lastName ?? ""}`.trim() || "Responsable"
              : "Nouveau responsable"}
          </DialogTitle>
          <DialogDescription>
            Père, mère ou tuteur légal de l&apos;élève.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormRow>
            <Field label="Lien de parenté" htmlFor="resp-kind" required>
              <Select id="resp-kind" value={kind} onChange={(e) => setKind(e.target.value as ResponsableRow["kind"])}>
                <option value="PERE">Père</option>
                <option value="MERE">Mère</option>
                <option value="TUTEUR">Tuteur / Tutrice</option>
                <option value="AUTRE">Autre</option>
              </Select>
            </Field>
            <Field label="Civilité" htmlFor="resp-civ">
              <Select id="resp-civ" value={civility} onChange={(e) => setCivility(e.target.value)}>
                <option value="">—</option>
                <option value="M.">M.</option>
                <option value="Mme">Mme</option>
              </Select>
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Nom" htmlFor="resp-ln" required>
              <Input id="resp-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </Field>
            <Field label="Prénom" htmlFor="resp-fn">
              <Input id="resp-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
          </FormRow>

          <div dir="rtl">
            <FormRow>
              <Field label="الشهرة (Nom en arabe)" htmlFor="resp-lnar">
                <Input id="resp-lnar" value={lastNameAr} onChange={(e) => setLastNameAr(e.target.value)} lang="ar" dir="rtl" />
              </Field>
              <Field label="الاسم (Prénom en arabe)" htmlFor="resp-fnar">
                <Input id="resp-fnar" value={firstNameAr} onChange={(e) => setFirstNameAr(e.target.value)} lang="ar" dir="rtl" />
              </Field>
            </FormRow>
          </div>

          <FormRow>
            <Field label="Nationalité libanaise" htmlFor="resp-leb">
              <Select
                id="resp-leb"
                value={isLebanese === true ? "yes" : isLebanese === false ? "no" : ""}
                onChange={(e) =>
                  setIsLebanese(e.target.value === "yes" ? true : e.target.value === "no" ? false : null)
                }
              >
                <option value="">—</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </Select>
            </Field>
            <Field label="Nationalité" htmlFor="resp-nat">
              <Input id="resp-nat" value={nationality1} onChange={(e) => setNationality1(e.target.value)} />
            </Field>
          </FormRow>

          <Field label="Email" htmlFor="resp-email">
            <Input id="resp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>

          <FormRow>
            <Field label="Téléphone mobile" htmlFor="resp-pm">
              <Input id="resp-pm" type="tel" inputMode="tel" value={phoneMobile} onChange={(e) => setPhoneMobile(e.target.value)} />
            </Field>
            <Field label="Téléphone domicile" htmlFor="resp-ph">
              <Input id="resp-ph" type="tel" inputMode="tel" value={phoneHome} onChange={(e) => setPhoneHome(e.target.value)} />
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Profession" htmlFor="resp-prof">
              <Input id="resp-prof" value={profession} onChange={(e) => setProfession(e.target.value)} />
            </Field>
            <Field label="Employeur / société" htmlFor="resp-emp">
              <Input id="resp-emp" value={employer} onChange={(e) => setEmployer(e.target.value)} />
            </Field>
          </FormRow>

          {error ? (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-[color:var(--color-danger)]">
              <AlertTriangle className="size-3.5" aria-hidden />
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          {mode === "edit" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onDelete}
              disabled={removing || pending}
              className="gap-1.5 text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10"
            >
              {removing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending || removing}>
              Annuler
            </Button>
            <Button type="button" onClick={onSubmit} disabled={pending || removing}>
              {pending ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
