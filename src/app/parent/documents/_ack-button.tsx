"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { acknowledgeDocument } from "@/app/admin/documents/_actions";

export function AcknowledgeButton({ documentId }: { documentId: string }) {
  const t = useTranslations("documents");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => {
        await acknowledgeDocument(documentId);
      })}
    >
      {pending ? "…" : t("ackButton")}
    </Button>
  );
}
