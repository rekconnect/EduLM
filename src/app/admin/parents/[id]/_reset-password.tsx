"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { resetParentPassword } from "../_actions";

export function ResetPasswordButton({ parentId }: { parentId: string }) {
  const t = useTranslations("parents");
  const [pending, startTransition] = useTransition();
  const [generated, setGenerated] = useState<string | null>(null);

  if (generated) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
        <p className="font-medium">{t("resetGenerated", { password: generated })}</p>
        <p className="mt-1 text-xs text-[color:var(--muted-fg)]">{t("resetCopyHint")}</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(generated).catch(() => {});
          }}
          className="mt-2 inline-flex rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1 text-xs font-medium hover:bg-[color:var(--muted)]"
        >
          Copier
        </button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resetParentPassword(parentId);
          if (result.newPassword) setGenerated(result.newPassword);
        })
      }
    >
      {pending ? "…" : t("resetPassword")}
    </Button>
  );
}
