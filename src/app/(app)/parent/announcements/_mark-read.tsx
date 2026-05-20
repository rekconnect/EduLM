"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAnnouncementRead } from "@/app/(app)/admin/announcements/_actions";

export function MarkReadButton({ announcementId }: { announcementId: string }) {
  const t = useTranslations("communication");
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      aria-busy={pending}
      className="gap-1.5"
      onClick={() =>
        startTransition(async () => {
          try {
            await markAnnouncementRead(announcementId);
            toast.success(t("markReadToast"));
          } catch {
            toast.error(t("markReadErrorToast"));
          }
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Check className="size-3.5" aria-hidden />
      )}
      {t("markRead")}
    </Button>
  );
}
