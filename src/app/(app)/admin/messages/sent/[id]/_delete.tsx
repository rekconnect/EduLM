"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { deleteBroadcast } from "../../_actions";

/**
 * Delete a sent message ("Accès complet" only — the page hides this button
 * otherwise and the action re-checks). Deleting a broadcast cascades to every
 * per-parent conversation it created, parent replies included.
 */
export function DeleteBroadcastButton({
  broadcastId,
  recipientCount,
  repliedCount,
}: {
  broadcastId: string;
  recipientCount: number;
  repliedCount: number;
}) {
  const t = useTranslations("messaging.sent");
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description:
        repliedCount > 0
          ? t("deleteConfirmBodyReplies", { count: recipientCount, replies: repliedCount })
          : t("deleteConfirmBody", { count: recipientCount }),
      confirmLabel: t("deleteConfirm"),
      cancelLabel: t("deleteCancel"),
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      try {
        const r = await deleteBroadcast(broadcastId);
        if (r.ok) {
          toast.success(t("deletedToast"));
          router.push("/admin/messages?tab=sent");
        } else {
          toast.error(r.error === "not-found" ? t("errNotFound") : t("errGeneric"));
        }
      } catch {
        toast.error(t("errGeneric"));
      }
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onDelete}
      disabled={pending}
      className="gap-2 text-[color:var(--color-danger)]"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-4" aria-hidden />
      )}
      {t("delete")}
    </Button>
  );
}
