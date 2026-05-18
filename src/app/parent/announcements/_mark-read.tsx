"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { markAnnouncementRead } from "@/app/admin/announcements/_actions";

export function MarkReadButton({ announcementId }: { announcementId: string }) {
  const t = useTranslations("communication");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAnnouncementRead(announcementId);
        })
      }
    >
      {pending ? "…" : t("markRead")}
    </Button>
  );
}
