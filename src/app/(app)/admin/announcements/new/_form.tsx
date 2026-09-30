"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Megaphone, ShieldCheck } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { RecipientPicker } from "@/components/messaging/recipient-picker";
import {
  isEmptyAudience,
  MESSAGE_BODY_MAX,
  MESSAGE_SUBJECT_MAX,
  type AudienceSpec,
  type PickerClass,
  type PickerEstablishment,
} from "@/lib/messaging-shared";
import { createAnnouncement, type AnnouncementFormState } from "../_actions";

/** Server error code → messaging.annonces key. */
const ERROR_KEYS: Record<string, string> = {
  required: "errRequired",
  tooLong: "errTooLong",
  noAudience: "errNoAudience",
  forbiddenAll: "errForbiddenAll",
  noRecipients: "errNoRecipients",
};

export function AnnouncementForm({
  establishments,
  levels,
  classes,
  allowAll,
}: {
  establishments: PickerEstablishment[];
  levels: string[];
  classes: PickerClass[];
  allowAll: boolean;
}) {
  const t = useTranslations("communication");
  const tA = useTranslations("messaging.annonces");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<AnnouncementFormState, FormData>(
    createAnnouncement,
    {},
  );
  const [spec, setSpec] = useState<AudienceSpec>({});
  const audienceEmpty = isEmptyAudience(spec);

  const errText = (code?: string) =>
    code ? tA(ERROR_KEYS[code] ?? "errGeneric") : undefined;

  // Success redirects to the list (which shows the confirmation); every
  // returned state is therefore an error worth surfacing.
  useEffect(() => {
    if (state.formError) toast.error(errText(state.formError));
    else if (state.errors && Object.keys(state.errors).length) toast.error(tA("errCheckForm"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const audienceError = errText(state.errors?.audienceSpec);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="audienceSpec" value={JSON.stringify(spec)} />

      <section
        role="group"
        aria-labelledby="announcement-audience-label"
        aria-describedby="announcement-audience-hint"
        className="space-y-2"
      >
        <div>
          <p
            id="announcement-audience-label"
            className="text-sm font-medium text-[color:var(--color-foreground)]"
          >
            {t("fieldAudience")}
            <span className="ms-0.5 text-[color:var(--color-danger)]">*</span>
          </p>
          <p
            id="announcement-audience-hint"
            className="mt-0.5 text-xs text-[color:var(--color-foreground-subtle)]"
          >
            {allowAll ? tA("audienceHint") : tA("audienceHintNoAll")}
          </p>
        </div>
        <RecipientPicker
          establishments={establishments}
          levels={levels}
          classes={classes}
          value={spec}
          onChange={setSpec}
          allowAll={allowAll}
          disabled={pending}
          showPreview
        />
        {audienceError ? (
          <p className="text-xs text-[color:var(--color-danger)]" role="alert">
            {audienceError}
          </p>
        ) : null}
      </section>

      <Field
        label={t("fieldTitle")}
        htmlFor="title"
        required
        error={errText(state.errors?.title)}
      >
        <Input
          id="title"
          name="title"
          required
          maxLength={MESSAGE_SUBJECT_MAX}
          defaultValue={state.values?.title}
          placeholder={tA("titlePlaceholder")}
          disabled={pending}
        />
      </Field>

      <Field
        label={t("fieldBody")}
        htmlFor="body"
        required
        error={errText(state.errors?.body)}
      >
        <Textarea
          id="body"
          name="body"
          rows={8}
          required
          maxLength={MESSAGE_BODY_MAX}
          defaultValue={state.values?.body}
          placeholder={tA("bodyPlaceholder")}
          disabled={pending}
        />
      </Field>

      <div className="flex items-start gap-2 rounded-lg bg-[color:var(--color-surface-sunken)] px-3 py-2.5 text-xs leading-relaxed text-[color:var(--color-foreground-muted)]">
        <ShieldCheck
          className="mt-px size-4 shrink-0 text-[color:var(--color-brand-600)]"
          aria-hidden
        />
        <p>{tA("emailPrivacyNote")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--color-border-subtle)] pt-4">
        {audienceEmpty ? (
          <p className="me-auto text-xs text-[color:var(--color-foreground-subtle)]">
            {tA("pickAudienceFirst")}
          </p>
        ) : null}
        <LinkButton href="/admin/announcements" variant="secondary">
          {tCommon("cancel")}
        </LinkButton>
        <Button
          type="submit"
          disabled={pending || audienceEmpty}
          aria-busy={pending}
          className="gap-1.5"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Megaphone className="size-4" aria-hidden />
          )}
          {pending ? tA("publishing") : tA("publish")}
        </Button>
      </div>
    </form>
  );
}
