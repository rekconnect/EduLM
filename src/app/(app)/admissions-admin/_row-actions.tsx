"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArchiveRestore,
  EyeOff,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  permanentlyDeleteApplication,
  restoreApplication,
  setApplicationArchived,
  softDeleteApplication,
} from "./_actions";

/**
 * Per-row menu for the admissions list. The available actions depend on
 * which section the row currently lives in:
 *   - active   → Archive, Delete (soft)
 *   - archived → Unarchive (back to active), Delete (soft)
 *   - deleted  → Restore (back to active), Delete permanently
 *
 * Soft delete moves the row into the Deleted section (recoverable);
 * permanent delete wipes it for good and is only offered from there.
 */
export function AdmissionRowActions({
  applicationId,
  childLabel,
  archived,
  deleted,
}: {
  applicationId: string;
  childLabel: string;
  archived: boolean;
  deleted: boolean;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [confirmSoftOpen, setConfirmSoftOpen] = useState(false);
  const [confirmHardOpen, setConfirmHardOpen] = useState(false);

  function onToggleArchive() {
    startTransition(async () => {
      const r = await setApplicationArchived(applicationId, !archived);
      if (r.ok) toast.success(archived ? t("unarchived") : t("archived"));
      else toast.error(t("archiveError"));
    });
  }

  function onRestore() {
    startTransition(async () => {
      const r = await restoreApplication(applicationId);
      if (r.ok) toast.success(t("restored"));
      else toast.error(t("restoreError"));
    });
  }

  function onConfirmSoftDelete() {
    startTransition(async () => {
      const r = await softDeleteApplication(applicationId);
      if (r.ok) {
        toast.success(t("deleted"));
        setConfirmSoftOpen(false);
      } else if (r.error === "produced-student") {
        toast.error(t("deleteRefusedAccepted"));
      } else {
        toast.error(t("deleteError"));
      }
    });
  }

  function onConfirmHardDelete() {
    startTransition(async () => {
      const r = await permanentlyDeleteApplication(applicationId);
      if (r.ok) {
        toast.success(t("deletedPermanently"));
        setConfirmHardOpen(false);
      } else if (r.error === "produced-student") {
        toast.error(t("deleteRefusedAccepted"));
      } else {
        toast.error(t("deletePermanentError"));
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={tCommon("more")}
            className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground-muted)]"
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal className="size-4" aria-hidden />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {deleted ? (
            <>
              <DropdownMenuItem onClick={onRestore} disabled={pending}>
                <RotateCcw className="me-2 size-4" aria-hidden />
                {t("restore")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmHardOpen(true)}
                disabled={pending}
                className="text-[color:var(--color-danger)] focus:text-[color:var(--color-danger)]"
              >
                <Trash2 className="me-2 size-4" aria-hidden />
                {t("deletePermanent")}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={onToggleArchive} disabled={pending}>
                {archived ? (
                  <>
                    <ArchiveRestore className="me-2 size-4" aria-hidden />
                    {t("unarchive")}
                  </>
                ) : (
                  <>
                    <EyeOff className="me-2 size-4" aria-hidden />
                    {t("archive")}
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmSoftOpen(true)}
                disabled={pending}
                className="text-[color:var(--color-danger)] focus:text-[color:var(--color-danger)]"
              >
                <Trash2 className="me-2 size-4" aria-hidden />
                {t("delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Soft-delete confirmation — recoverable from the Deleted section. */}
      <Dialog open={confirmSoftOpen} onOpenChange={setConfirmSoftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmDesc", { name: childLabel })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmSoftOpen(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={onConfirmSoftDelete}
              disabled={pending}
              className="bg-[color:var(--color-danger)] text-white hover:bg-[color:var(--color-danger)]/90"
            >
              {pending ? (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
              ) : null}
              {pending ? tCommon("loading") : t("deleteConfirmCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation — irreversible, only from Deleted. */}
      <Dialog open={confirmHardOpen} onOpenChange={setConfirmHardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deletePermanentConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deletePermanentConfirmDesc", { name: childLabel })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmHardOpen(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={onConfirmHardDelete}
              disabled={pending}
              className="bg-[color:var(--color-danger)] text-white hover:bg-[color:var(--color-danger)]/90"
            >
              {pending ? (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
              ) : null}
              {pending ? tCommon("loading") : t("deletePermanentConfirmCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
