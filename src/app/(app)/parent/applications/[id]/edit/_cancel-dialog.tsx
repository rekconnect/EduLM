"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelDraftApplication } from "../../_actions";

export function CancelApplicationDialog({
  applicationId,
}: {
  applicationId: string;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await cancelDraftApplication(applicationId);
        if (result.ok) {
          toast.success(t("cancelSuccessToast"));
          setOpen(false);
          router.push("/parent/applications");
          router.refresh();
        } else {
          toast.error(t("cancelErrorToast"));
        }
      } catch {
        toast.error(t("cancelErrorToast"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--color-danger)] transition-colors hover:bg-[color:var(--color-danger-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-danger)]/30">
        <X className="size-4" aria-hidden />
        {t("cancelApplication")}
      </DialogTrigger>
      <DialogContent className="bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground)]">
        <DialogHeader>
          <DialogTitle>{t("cancelConfirmTitle")}</DialogTitle>
          <DialogDescription className="text-[color:var(--color-foreground-muted)]">
            {t("cancelConfirmDesc")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)] disabled:opacity-60"
          >
            {tCommon("back")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            aria-busy={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[color:var(--color-danger)] px-4 py-2 text-sm font-medium text-white shadow-card transition-colors duration-150 ease-out hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-danger)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {tCommon("loading")}
              </>
            ) : (
              <>
                <Trash2 className="size-4" aria-hidden />
                {t("cancelConfirmAction")}
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
