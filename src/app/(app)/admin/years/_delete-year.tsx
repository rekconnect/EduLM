"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteYear } from "./_actions";

/**
 * Per-row "Supprimer l'année" trigger on the /admin/years table.
 * Type-the-label confirmation in the modal — destructive button stays
 * disabled until the label matches.
 *
 * Hidden when the year has enrollments (the table already shows the
 * count; admin can unenroll students first if they really want to
 * delete that year).
 */
export function DeleteYearButton({
  yearId,
  yearLabel,
  classCount,
  enrollmentCount,
}: {
  yearId: string;
  yearLabel: string;
  classCount: number;
  enrollmentCount: number;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();
  const labelMatches = confirmText.trim() === yearLabel.trim();

  function onConfirm() {
    if (!labelMatches) return;
    startTransition(async () => {
      const r = await deleteYear(yearId);
      if (r.ok) {
        toast.success(t("yearDeleted", { label: yearLabel }));
        setOpen(false);
        router.refresh();
      } else if (r.error === "has-enrollments") {
        toast.error(
          t("yearDeleteRefusedEnrollments", { count: r.enrollmentCount ?? 0 }),
        );
      } else {
        toast.error(t("yearDeleteError"));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setConfirmText("");
          setOpen(true);
        }}
        aria-label={t("yearDeleteCta")}
        className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-danger)]/10 hover:text-[color:var(--color-danger)]"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("yearDeleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("yearDeleteConfirmDesc", {
                label: yearLabel,
                classes: classCount,
                enrollments: enrollmentCount,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label
              htmlFor={`confirm-year-${yearId}`}
              className="block text-xs font-medium text-[color:var(--color-foreground)]"
            >
              {t("yearDeleteConfirmInputLabel", { label: yearLabel })}
            </label>
            <input
              id={`confirm-year-${yearId}`}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={yearLabel}
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
              {pending ? tCommon("loading") : t("yearDeleteCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
