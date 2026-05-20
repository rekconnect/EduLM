"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acknowledgeDocument } from "@/app/(app)/admin/documents/_actions";

export function AcknowledgeButton({ documentId }: { documentId: string }) {
  const t = useTranslations("documents");
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      className="gap-1.5"
      onClick={() =>
        startTransition(async () => {
          try {
            await acknowledgeDocument(documentId);
            toast.success(t("ackToast"));
          } catch {
            toast.error(t("ackErrorToast"));
          }
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <CheckCircle2 className="size-3.5" aria-hidden />
      )}
      {t("ackButton")}
    </Button>
  );
}
