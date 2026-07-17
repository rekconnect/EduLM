"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { cancelRequest } from "./_actions";

export function CancelRequestButton({ id }: { id: string }) {
  const t = useTranslations("staff");
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: t("cancelConfirmTitle"),
          confirmLabel: t("cancel"),
          destructive: true,
        });
        if (ok) start(() => void cancelRequest(id));
      }}
    >
      {t("cancel")}
    </Button>
  );
}
