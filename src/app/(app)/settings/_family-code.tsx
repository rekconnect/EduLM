"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { updateFamilyCodeSettings } from "./_actions";

export function FamilyCodeForm({
  initial,
}: {
  initial: {
    familyCodePrefix: string | null;
    familyCodePadding: number;
    familyCodeNextSequence: number;
  };
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [prefix, setPrefix] = useState(initial.familyCodePrefix ?? "");
  const [padding, setPadding] = useState(initial.familyCodePadding);

  // Live preview of what the next code will look like with current inputs.
  const previewSeq = initial.familyCodeNextSequence;
  const previewPadded = String(previewSeq).padStart(Math.max(padding, 0), "0");
  const previewCode = `${prefix || "F-"}${previewPadded}`;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateFamilyCodeSettings(fd);
      if (result.ok) toast.success(t("familyCode.saved"));
      else toast.error(t("familyCode.saveError"));
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormRow>
        <Field
          label={t("familyCode.prefix")}
          htmlFor="familyCodePrefix"
          hint={t("familyCode.prefixHint")}
        >
          <Input
            id="familyCodePrefix"
            name="familyCodePrefix"
            maxLength={16}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="F-"
          />
        </Field>
        <Field
          label={t("familyCode.padding")}
          htmlFor="familyCodePadding"
          hint={t("familyCode.paddingHint")}
        >
          <Input
            id="familyCodePadding"
            name="familyCodePadding"
            type="number"
            min={0}
            max={8}
            value={padding}
            onChange={(e) => setPadding(parseInt(e.target.value, 10) || 0)}
          />
        </Field>
      </FormRow>

      <div className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3 text-sm">
        <span className="text-[color:var(--color-foreground-muted)]">
          {t("familyCode.nextWillBe")}:
        </span>{" "}
        <span className="font-mono font-semibold text-[color:var(--color-foreground)]">
          {previewCode}
        </span>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
