"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FieldsRenderer,
  type FieldAnswers,
  type FieldExtras,
} from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { updateStudentCustomAnswers } from "../_actions";

export function StudentCustomAnswersForm({
  studentId,
  config,
  initialAnswers,
  extras,
}: {
  studentId: string;
  config: EntityFieldsConfig;
  initialAnswers: FieldAnswers;
  extras?: FieldExtras;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [answers, setAnswers] = useState<FieldAnswers>(initialAnswers);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const [id, v] of Object.entries(answers)) {
      if (v.trim().length > 0) fd.append(`f-${id}`, v);
    }
    startTransition(async () => {
      const result = await updateStudentCustomAnswers(studentId, fd);
      if (result.ok) toast.success(t("fieldsConfig.saved"));
      else toast.error(t("fieldsConfig.saveError"));
    });
  }

  if (config.fields.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-foreground-muted)]">
        {t("fieldsConfig.noFieldsConfigured")}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FieldsRenderer
        config={config}
        answers={answers}
        extras={extras}
        onChange={(id, value) =>
          setAnswers((prev) => ({ ...prev, [id]: value }))
        }
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
