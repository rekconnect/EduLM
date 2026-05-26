"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveValidationAck } from "../../_actions";

/**
 * Validation tab — final acknowledgement. Renders a documents-list
 * reference table (admin authors it once in /settings; placeholder
 * text shown if empty) plus the "j'ai pris connaissance" checkbox.
 *
 * Phase 4: the single ack field is registry-driven. The docs-list
 * pane stays as-is — it's admin-authored content, not a parent
 * field, so it's not in the registry.
 */
export function DossierTabValidation({
  applicationId,
  acknowledged,
  documentsListMarkdown,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  acknowledged: boolean;
  documentsListMarkdown: string;
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(acknowledged);

  const fAck = useField("validation.ack.acknowledged");

  function onToggle() {
    if (editMode) {
      // Preview only flip — don't persist
      setChecked((v) => !v);
      return;
    }
    const next = !checked;
    setChecked(next);
    startTransition(async () => {
      const r = await saveValidationAck(applicationId, next);
      if (!r.ok) {
        setChecked(!next);
        toast.error(t("saveError"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("validation.docsTitle")}
          description={t("validation.docsHint")}
        />
        <CardBody>
          {documentsListMarkdown.trim().length > 0 ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-4 text-sm font-sans leading-relaxed text-[color:var(--color-foreground)]">
              {documentsListMarkdown}
            </pre>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-8 text-center text-sm text-[color:var(--color-foreground-muted)]">
              <ClipboardList className="size-6" aria-hidden />
              <p>{t("validation.docsEmpty")}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {fAck?.hidden ? null : (
        <Card>
          <CardHeader title={t("validation.ackTitle")} />
          <CardBody>
            <EditableField fieldKey="validation.ack.acknowledged">
              <label className="flex items-start gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-4 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={onToggle}
                  disabled={disabled || pending}
                  className="mt-0.5 size-4"
                />
                <span className="flex-1">
                  <span className="font-medium">
                    {fAck?.label ?? t("validation.ackLabel")}
                  </span>
                  {fAck?.required ? (
                    <span className="ms-0.5 text-[color:var(--color-danger)]">
                      *
                    </span>
                  ) : null}
                  {checked ? (
                    <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-success-soft-fg)]">
                      <CheckCircle2 className="size-3" aria-hidden />
                      {tCommon("saved")}
                    </span>
                  ) : null}
                  {pending ? (
                    <Loader2 className="ms-2 inline size-3 animate-spin" aria-hidden />
                  ) : null}
                </span>
              </label>
              <p className="mt-3 text-xs text-[color:var(--color-foreground-muted)]">
                {t("validation.submitHint")}
              </p>
            </EditableField>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
