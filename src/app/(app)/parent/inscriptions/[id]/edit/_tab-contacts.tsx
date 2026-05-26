"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  Clock,
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
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { RESPONSABLE_RELATIONS } from "./_section-responsable-lebanese";
import { deleteContact, saveContact } from "../../_actions";

type ContactRow = {
  id: string;
  kind: "URGENCE" | "PICKUP";
  firstName: string;
  lastName: string;
  relation: string | null;
  phoneMobile: string | null;
  phoneHome: string | null;
};

/**
 * Autres contacts tab. Two stacked lists:
 *   - Contact en cas d'urgence (au moins 1 obligatoire)
 *   - Personne autorisée à récupérer l'enfant (optionnel)
 *
 * Phase 4: list-level visibility honors contacts.urgence.list /
 * contacts.pickup.list hidden overrides. The modal's 5 fields (relation
 * / lastName / firstName / phoneMobile / phoneHome) are individually
 * wrapped so admin can edit them via the WYSIWYG drawer.
 */
export function DossierTabContacts({
  applicationId,
  initial,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  initial: ContactRow[];
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");

  const urgence = initial.filter((c) => c.kind === "URGENCE");
  const pickup = initial.filter((c) => c.kind === "PICKUP");

  const fUrgenceList = useField("contacts.urgence.list");
  const fPickupList = useField("contacts.pickup.list");

  const [editing, setEditing] = useState<
    | { mode: "new"; kind: "URGENCE" | "PICKUP" }
    | { mode: "edit"; contact: ContactRow }
    | null
  >(null);

  return (
    <div className="space-y-6">
      {fUrgenceList?.hidden ? null : (
        <EditableField fieldKey="contacts.urgence.list">
          <Card>
            <CardHeader
              title={fUrgenceList?.label ?? t("contacts.urgenceTitle")}
              description={t("contacts.urgenceHint")}
            />
            <CardBody>
              <ContactList
                rows={urgence}
                emptyLabel={t("contacts.empty")}
                disabled={disabled}
                onAdd={() => setEditing({ mode: "new", kind: "URGENCE" })}
                onEdit={(c) => setEditing({ mode: "edit", contact: c })}
                addLabel={t("contacts.addUrgence")}
              />
            </CardBody>
          </Card>
        </EditableField>
      )}

      {fPickupList?.hidden ? null : (
        <EditableField fieldKey="contacts.pickup.list">
          <Card>
            <CardHeader
              title={fPickupList?.label ?? t("contacts.pickupTitle")}
              description={t("contacts.pickupHint")}
            />
            <CardBody className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-[color:var(--color-warning-soft-fg)]/30 bg-[color:var(--color-warning-soft)] px-3 py-2 text-xs text-[color:var(--color-warning-soft-fg)]">
                <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{t("contacts.pickup72hNotice")}</span>
              </div>
              <ContactList
                rows={pickup}
                emptyLabel={t("contacts.empty")}
                disabled={disabled}
                onAdd={() => setEditing({ mode: "new", kind: "PICKUP" })}
                onEdit={(c) => setEditing({ mode: "edit", contact: c })}
                addLabel={t("contacts.addPickup")}
              />
            </CardBody>
          </Card>
        </EditableField>
      )}

      {editing ? (
        <ContactEditDialog
          applicationId={applicationId}
          mode={editing.mode}
          kind={editing.mode === "new" ? editing.kind : editing.contact.kind}
          initial={editing.mode === "edit" ? editing.contact : null}
          onClose={() => setEditing(null)}
          editMode={editMode}
        />
      ) : null}
    </div>
  );
}

function ContactList({
  rows,
  emptyLabel,
  addLabel,
  disabled,
  onAdd,
  onEdit,
}: {
  rows: ContactRow[];
  emptyLabel: string;
  addLabel: string;
  disabled: boolean;
  onAdd: () => void;
  onEdit: (c: ContactRow) => void;
}) {
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-6 text-center text-sm text-[color:var(--color-foreground-muted)]">
          {emptyLabel}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onEdit(c)}
                className="group flex w-full items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-3 text-left transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-sunken)]"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                  <UserIcon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[color:var(--color-foreground)] group-hover:text-[color:var(--color-brand-600)]">
                    {c.firstName} {c.lastName}
                  </p>
                  {c.relation ? (
                    <p className="truncate text-xs text-[color:var(--color-foreground-muted)]">
                      {c.relation}
                    </p>
                  ) : null}
                  {c.phoneMobile || c.phoneHome ? (
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-[color:var(--color-foreground-muted)]">
                      <Phone className="size-3" aria-hidden />
                      {c.phoneMobile || c.phoneHome}
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
            onClick={onAdd}
            className="gap-1.5"
          >
            <Plus className="size-4" aria-hidden />
            {addLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ContactEditDialog({
  applicationId,
  mode,
  kind,
  initial,
  onClose,
  editMode,
}: {
  applicationId: string;
  mode: "new" | "edit";
  kind: "URGENCE" | "PICKUP";
  initial: ContactRow | null;
  onClose: () => void;
  editMode: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const tResp = useTranslations("dossierForms");
  const [pending, startTransition] = useTransition();
  const [removing, startRemove] = useTransition();
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [relation, setRelation] = useState(initial?.relation ?? "");
  const [phoneMobile, setPhoneMobile] = useState(initial?.phoneMobile ?? "");
  const [phoneHome, setPhoneHome] = useState(initial?.phoneHome ?? "");
  const [error, setError] = useState<string | null>(null);

  const fRelation = useField("contacts.contact.relation");
  const fLastName = useField("contacts.contact.lastName");
  const fFirstName = useField("contacts.contact.firstName");
  const fPhoneMobile = useField("contacts.contact.phoneMobile");
  const fPhoneHome = useField("contacts.contact.phoneHome");

  function onSubmit() {
    if (editMode) {
      toast.info("Aperçu — modifications non enregistrées");
      onClose();
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await saveContact(
        applicationId,
        mode === "edit" && initial ? initial.id : null,
        {
          kind,
          firstName,
          lastName,
          relation: relation || undefined,
          phoneMobile: phoneMobile || undefined,
          phoneHome: phoneHome || undefined,
        },
      );
      if (r.ok) {
        toast.success(tCommon("saved"));
        onClose();
      } else {
        setError(t("saveError"));
      }
    });
  }

  function onDelete() {
    if (!initial) return;
    if (editMode) {
      onClose();
      return;
    }
    startRemove(async () => {
      const r = await deleteContact(applicationId, initial.id);
      if (r.ok) {
        toast.success(t("contacts.deleted"));
        onClose();
      } else {
        setError(t("saveError"));
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit"
              ? `${initial?.firstName ?? ""} ${initial?.lastName ?? ""}`.trim() ||
                t("contacts.editTitle")
              : kind === "URGENCE"
                ? t("contacts.newUrgenceTitle")
                : t("contacts.newPickupTitle")}
          </DialogTitle>
          <DialogDescription>
            {kind === "URGENCE"
              ? t("contacts.urgenceHint")
              : t("contacts.pickupHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fRelation?.hidden ? null : (
            <EditableField fieldKey="contacts.contact.relation">
              <Field
                label={fRelation?.label ?? tResp("responsable.relation")}
                htmlFor="contact-relation"
                required={fRelation?.required ?? false}
              >
                <Select
                  id="contact-relation"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                >
                  <option value="">—</option>
                  {RESPONSABLE_RELATIONS.map((r) => (
                    <option key={r} value={r}>
                      {tResp(`responsable.relations.${r}` as never)}
                    </option>
                  ))}
                </Select>
              </Field>
            </EditableField>
          )}

          <FormRow>
            {fLastName?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="contacts.contact.lastName">
                <Field
                  label={fLastName?.label ?? t("contacts.lastName")}
                  htmlFor="contact-ln"
                  required={fLastName?.required ?? true}
                >
                  <Input
                    id="contact-ln"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required={fLastName?.required ?? true}
                  />
                </Field>
              </EditableField>
            )}
            {fFirstName?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="contacts.contact.firstName">
                <Field
                  label={fFirstName?.label ?? t("contacts.firstName")}
                  htmlFor="contact-fn"
                  required={fFirstName?.required ?? true}
                >
                  <Input
                    id="contact-fn"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required={fFirstName?.required ?? true}
                  />
                </Field>
              </EditableField>
            )}
          </FormRow>

          <FormRow>
            {fPhoneMobile?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="contacts.contact.phoneMobile">
                <Field
                  label={fPhoneMobile?.label ?? t("contacts.phoneMobile")}
                  htmlFor="contact-pm"
                  required={fPhoneMobile?.required ?? false}
                >
                  <Input
                    id="contact-pm"
                    type="tel"
                    inputMode="tel"
                    value={phoneMobile}
                    onChange={(e) => setPhoneMobile(e.target.value)}
                  />
                </Field>
              </EditableField>
            )}
            {fPhoneHome?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="contacts.contact.phoneHome">
                <Field
                  label={fPhoneHome?.label ?? t("contacts.phoneHome")}
                  htmlFor="contact-ph"
                  required={fPhoneHome?.required ?? false}
                >
                  <Input
                    id="contact-ph"
                    type="tel"
                    inputMode="tel"
                    value={phoneHome}
                    onChange={(e) => setPhoneHome(e.target.value)}
                  />
                </Field>
              </EditableField>
            )}
          </FormRow>

          {error ? (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-sm text-[color:var(--color-danger)]"
            >
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
              {removing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              {tCommon("delete")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending || removing}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="button" onClick={onSubmit} disabled={pending || removing}>
              {pending ? (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
              ) : null}
              {pending ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
