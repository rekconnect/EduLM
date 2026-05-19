"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateEmailDefaults } from "./_actions";

export function EmailDefaultsForm({
  initial,
}: {
  initial: {
    emailSenderName: string | null;
    emailSignature: string | null;
  };
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [senderName, setSenderName] = useState(initial.emailSenderName ?? "");
  const [signature, setSignature] = useState(initial.emailSignature ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("emailSenderName", senderName);
    fd.append("emailSignature", signature);

    startTransition(async () => {
      try {
        const result = await updateEmailDefaults(fd);
        if (result.ok) toast.success(t("updatedToast"));
        else toast.error(t("errorToast"));
      } catch {
        toast.error(t("errorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field
        label={t("email.senderName")}
        htmlFor="emailSenderName"
        hint={t("email.senderNameHint")}
      >
        <Input
          id="emailSenderName"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          maxLength={120}
          placeholder="Lycée Montaigne"
        />
      </Field>

      <Field
        label={t("email.signature")}
        htmlFor="emailSignature"
        hint={t("email.signatureHint")}
      >
        <Textarea
          id="emailSignature"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          rows={5}
          maxLength={1000}
          placeholder={t("email.signaturePlaceholder")}
        />
      </Field>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
