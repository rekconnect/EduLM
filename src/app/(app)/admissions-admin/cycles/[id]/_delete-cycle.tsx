"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteCycle } from "../../_actions";

/**
 * Danger-zone delete button on the cycle edit page. The destructive
 * action is gated behind a typed confirmation (admin must re-enter
 * the cycle's label) so accidental clicks on the wrong cycle don't
 * wipe real data.
 *
 * If any application under this cycle already produced a Student
 * (accepted kid), the server-side guard fires and we surface a
 * specific error toast — admin needs to unlink those manually.
 */
export function DeleteCycleButton({
  cycleId,
  cycleLabel,
  applicationCount,
}: {
  cycleId: string;
  cycleLabel: string;
  applicationCount: number;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  const labelMatches = confirmText.trim() === cycleLabel.trim();

  function onConfirm() {
    if (!labelMatches) return;
    startTransition(async () => {
      const r = await deleteCycle(cycleId);
      if (r.ok) {
        toast.success(t("cycleDeleted", { label: cycleLabel }));
        setOpen(false);
        router.push("/admissions-admin/cycles");
        router.refresh();
      } else if (r.error === "produced-students") {
        toast.error(
          t("cycleDeleteRefusedAccepted", {
            count: r.producedStudentCount ?? 0,
          }),
        );
      } else {
        toast.error(t("cycleDeleteError"));
      }
    });
  }

  return (
    <>
      <div className="rounded-lg border border-[color:var(--color-danger)]/20 bg-[color:var(--color-danger)]/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-danger)]/10 text-[color:var(--color-danger)]">
            <AlertTriangle className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              {t("cycleDeleteZoneTitle")}
            </h3>
            <p className="mt-1 text-xs text-[color:var(--color-foreground-muted)]">
              {t("cycleDeleteZoneHint", { count: applicationCount })}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setConfirmText("");
              setOpen(true);
            }}
            className="shrink-0 gap-1.5 bg-[color:var(--color-danger)] text-white hover:bg-[color:var(--color-danger)]/90"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {t("cycleDeleteCta")}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cycleDeleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("cycleDeleteConfirmDesc", {
                label: cycleLabel,
                count: applicationCount,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label
              htmlFor="confirm-label"
              className="block text-xs font-medium text-[color:var(--color-foreground)]"
            >
              {t("cycleDeleteConfirmInputLabel", { label: cycleLabel })}
            </label>
            <input
              id="confirm-label"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={cycleLabel}
              className="w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-danger)]/40"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={!labelMatches || pending}
              className="bg-[color:var(--color-danger)] text-white hover:bg-[color:var(--color-danger)]/90"
            >
              {pending ? (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
              ) : null}
              {pending ? tCommon("loading") : t("cycleDeleteCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
