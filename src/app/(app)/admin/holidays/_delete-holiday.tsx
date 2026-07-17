"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { deleteHoliday } from "./_actions";

export function DeleteHolidayButton({ id }: { id: string }) {
  const t = useTranslations("holidays");
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t("delete")}
      onClick={async () => {
        const ok = await confirm({ title: t("deleteConfirm"), confirmLabel: t("delete"), destructive: true });
        if (ok) start(() => void deleteHoliday(id));
      }}
      className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-danger-soft)] hover:text-[color:var(--color-danger-soft-fg)] disabled:opacity-50"
    >
      <Trash2 className="size-3.5" aria-hidden />
    </button>
  );
}
