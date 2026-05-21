"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArchiveRestore,
  EyeOff,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBulkSelection } from "@/components/bulk-selection";
import {
  bulkPermanentlyDeleteApplications,
  bulkRestoreApplications,
  bulkSetApplicationsArchived,
  bulkSoftDeleteApplications,
} from "./_actions";

type View = "active" | "archived" | "deleted";

/**
 * Floating action bar above the admissions table. Only renders when at
 * least one row is selected; the available buttons depend on which
 * section the admin is currently viewing.
 *
 * The "permanently delete" action is the only one that prompts for
 * confirmation — every other action is recoverable (either by another
 * tab switch + bulk action, or per-row).
 */
export function AdmissionsBulkToolbar({ view }: { view: View }) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const { selected, count, clear, allIds, toggleAll, allSelected } =
    useBulkSelection();
  const [pending, startTransition] = useTransition();
  const [confirmPurge, setConfirmPurge] = useState(false);

  if (count === 0) return null;
  const ids = [...selected];

  function announce(r: { ok: boolean; processed: number; skipped: number }) {
    if (!r.ok) {
      toast.error(t("bulkError"));
      return;
    }
    if (r.skipped > 0) {
      toast.success(
        t("bulkPartial", { processed: r.processed, skipped: r.skipped }),
      );
    } else {
      toast.success(t("bulkDone", { processed: r.processed }));
    }
    clear();
  }

  function onArchive() {
    startTransition(async () => announce(await bulkSetApplicationsArchived(ids, true)));
  }
  function onUnarchive() {
    startTransition(async () => announce(await bulkSetApplicationsArchived(ids, false)));
  }
  function onSoftDelete() {
    startTransition(async () => announce(await bulkSoftDeleteApplications(ids)));
  }
  function onRestore() {
    startTransition(async () => announce(await bulkRestoreApplications(ids)));
  }
  function onPurge() {
    startTransition(async () => {
      const r = await bulkPermanentlyDeleteApplications(ids);
      announce(r);
      setConfirmPurge(false);
    });
  }

  return (
    <>
      <div
        role="region"
        aria-label={t("bulkRegionLabel")}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)] px-4 py-3 shadow-card"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clear}
            aria-label={tCommon("clearSelection")}
            className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-brand-700)] transition-colors hover:bg-[color:var(--color-brand-100)]"
          >
            <X className="size-4" aria-hidden />
          </button>
          <p className="text-sm font-medium text-[color:var(--color-brand-700)] tabular-nums">
            {t("bulkSelected", { count })}
          </p>
          {!allSelected && allIds.length > count ? (
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-medium text-[color:var(--color-brand-600)] underline-offset-2 hover:underline"
            >
              {t("bulkSelectAll", { total: allIds.length })}
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === "active" ? (
            <>
              <BulkActionButton
                onClick={onArchive}
                icon={EyeOff}
                label={t("bulkArchive")}
                pending={pending}
              />
              <BulkActionButton
                onClick={onSoftDelete}
                icon={Trash2}
                label={t("bulkDelete")}
                pending={pending}
                danger
              />
            </>
          ) : null}

          {view === "archived" ? (
            <>
              <BulkActionButton
                onClick={onUnarchive}
                icon={ArchiveRestore}
                label={t("bulkUnarchive")}
                pending={pending}
              />
              <BulkActionButton
                onClick={onSoftDelete}
                icon={Trash2}
                label={t("bulkDelete")}
                pending={pending}
                danger
              />
            </>
          ) : null}

          {view === "deleted" ? (
            <>
              <BulkActionButton
                onClick={onRestore}
                icon={RotateCcw}
                label={t("bulkRestore")}
                pending={pending}
              />
              <BulkActionButton
                onClick={() => setConfirmPurge(true)}
                icon={Trash2}
                label={t("bulkDeletePermanent")}
                pending={pending}
                danger
              />
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulkDeletePermanentConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("bulkDeletePermanentConfirmDesc", { count })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmPurge(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={onPurge}
              disabled={pending}
              className="bg-[color:var(--color-danger)] text-white hover:bg-[color:var(--color-danger)]/90"
            >
              {pending ? (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
              ) : null}
              {pending ? tCommon("loading") : t("bulkDeletePermanentCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkActionButton({
  onClick,
  icon: Icon,
  label,
  pending,
  danger,
}: {
  onClick: () => void;
  icon: typeof Trash2;
  label: string;
  pending: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        danger
          ? "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-danger)]/30 bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-danger)] transition-colors hover:bg-[color:var(--color-danger)]/10 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface-sunken)] disabled:opacity-50"
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-3.5" aria-hidden />
      )}
      {label}
    </button>
  );
}
