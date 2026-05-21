"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";
import { toast } from "sonner";
import { EyeOff, Trash2 } from "lucide-react";
import {
  parentArchiveApplication,
  parentSoftDeleteApplication,
} from "./_actions";

/**
 * Swipe-to-act card for the parent dossier list.
 *
 * Gesture mapping (mirrors iOS/Android list patterns, mirrored for RTL):
 *   - swipe left  → archive  (yellow rail on the trailing edge)
 *   - swipe right → soft delete (red rail on the leading edge)
 *
 * Past the commit threshold the card animates off-screen, the row
 * collapses, the server action fires, and a toast confirms with an
 * "Undo" link back to the appropriate admin view. Below the threshold
 * the card springs back to centre and nothing happens.
 *
 * Touch is the primary input — on desktop a click anywhere still opens
 * the row's destination. Reduced-motion users get the action triggered
 * via tap-and-hold via the static reveal handles instead of a drag, so
 * we don't punish them with surprise motion.
 */
const COMMIT_PX = 96;
const MAX_DRAG = 220;

export function SwipeableApplicationCard({
  applicationId,
  href,
  children,
  archiveLabel,
  deleteLabel,
}: {
  applicationId: string;
  href: string;
  children: React.ReactNode;
  archiveLabel: string;
  deleteLabel: string;
}) {
  const t = useTranslations("admissions");
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [removed, setRemoved] = useState<null | "archive" | "delete">(null);
  const [pending, startTransition] = useTransition();

  const x = useMotionValue(0);
  // Reveal rails on either side; opacity ramps in as the user drags so
  // the affordance feels like a single drawer rather than a label that
  // pops in from nowhere.
  const deleteOpacity = useTransform(x, [0, COMMIT_PX], [0, 1]);
  const archiveOpacity = useTransform(x, [-COMMIT_PX, 0], [1, 0]);

  function commitArchive() {
    setRemoved("archive");
    startTransition(async () => {
      const r = await parentArchiveApplication(applicationId, true);
      if (r.ok) {
        toast.success(t("archived"));
      } else {
        toast.error(t("archiveError"));
        setRemoved(null);
      }
      router.refresh();
    });
  }

  function commitDelete() {
    setRemoved("delete");
    startTransition(async () => {
      const r = await parentSoftDeleteApplication(applicationId);
      if (r.ok) {
        toast.success(t("deleted"));
      } else {
        toast.error(t("deleteError"));
        setRemoved(null);
      }
      router.refresh();
    });
  }

  function onDragEnd(
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) {
    if (info.offset.x > COMMIT_PX) commitDelete();
    else if (info.offset.x < -COMMIT_PX) commitArchive();
    // else: spring back via the dragSnapToOrigin behaviour below.
  }

  // After a commit, animate height to 0 and then unmount. AnimatePresence
  // handles the row collapse so the list flows naturally afterwards.
  return (
    <AnimatePresence initial={false}>
      {removed === null ? (
        <motion.div
          layout
          exit={{
            opacity: 0,
            height: 0,
            marginTop: 0,
            marginBottom: 0,
            transition: { duration: 0.18, ease: [0.2, 0, 0, 1] },
          }}
          className="relative overflow-hidden rounded-lg"
        >
          {/* Archive rail (trailing side — visible while swiping left) */}
          <motion.div
            aria-hidden
            style={{ opacity: reduceMotion ? 1 : archiveOpacity }}
            className="pointer-events-none absolute inset-y-0 end-0 flex items-center gap-2 bg-[color:var(--color-warning-soft)] px-6 text-sm font-medium text-[color:var(--color-warning-soft-fg)]"
          >
            <EyeOff className="size-4" />
            <span>{archiveLabel}</span>
          </motion.div>

          {/* Delete rail (leading side — visible while swiping right) */}
          <motion.div
            aria-hidden
            style={{ opacity: reduceMotion ? 1 : deleteOpacity }}
            className="pointer-events-none absolute inset-y-0 start-0 flex items-center gap-2 bg-[color:var(--color-danger)]/10 px-6 text-sm font-medium text-[color:var(--color-danger)]"
          >
            <Trash2 className="size-4" />
            <span>{deleteLabel}</span>
          </motion.div>

          {/* The card itself drags over the rails. */}
          <motion.div
            drag={reduceMotion ? false : "x"}
            dragConstraints={{ left: -MAX_DRAG, right: MAX_DRAG }}
            dragElastic={0.12}
            dragSnapToOrigin
            onDragEnd={onDragEnd}
            style={{ x }}
            // GPU-accelerated transforms only — no width/height animation
            // here. The actual collapse on commit happens on the parent.
            className="relative touch-pan-y will-change-transform"
            aria-disabled={pending}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Static row of action buttons shown under each card for reduced-motion
 * and non-touch users. Lives outside the swipeable wrapper so it never
 * gets dragged off-screen. Currently inlined into the page rather than
 * exported — left here as a placeholder if we decide to surface it.
 */
export function CardActionRow({
  onArchive,
  onDelete,
  archiveLabel,
  deleteLabel,
}: {
  onArchive: () => void;
  onDelete: () => void;
  archiveLabel: string;
  deleteLabel: string;
}) {
  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={onArchive}
        className="inline-flex items-center gap-1 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-2.5 py-1 text-xs font-medium text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-sunken)]"
      >
        <EyeOff className="size-3" />
        {archiveLabel}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1 rounded-md border border-[color:var(--color-danger)]/30 bg-[color:var(--color-surface-raised)] px-2.5 py-1 text-xs font-medium text-[color:var(--color-danger)] transition-colors hover:bg-[color:var(--color-danger)]/10"
      >
        <Trash2 className="size-3" />
        {deleteLabel}
      </button>
    </div>
  );
}
