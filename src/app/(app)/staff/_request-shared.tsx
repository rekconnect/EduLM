import type { AttendanceRequestKind, AttendanceRequestStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/** Translation key (in the `staff` namespace) for a request status. */
export function statusKey(status: AttendanceRequestStatus): string {
  return {
    PENDING_SUPERVISOR: "statusPendingSupervisor",
    PENDING_FINANCE: "statusPendingFinance",
    APPROVED: "statusApproved",
    REJECTED: "statusRejected",
    CANCELLED: "statusCancelled",
  }[status];
}

/** Translation key (in the `staff` namespace) for a request kind. */
export function kindLabelKey(kind: AttendanceRequestKind): string {
  return {
    ABSENCE: "kindAbsence",
    PERMISSION: "kindPermission",
    PRESENCE: "kindPresence",
    PERMANENCE: "kindPermanence",
  }[kind];
}

const TONE: Record<AttendanceRequestStatus, string> = {
  PENDING_SUPERVISOR:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  PENDING_FINANCE:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  APPROVED: "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  REJECTED: "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger-soft-fg)]",
  CANCELLED:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-subtle)]",
};

export function StatusPill({ status, label }: { status: AttendanceRequestStatus; label: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", TONE[status])}>
      {label}
    </span>
  );
}

type RangeInput = {
  startDate: Date;
  endDate: Date;
  startTime: string | null;
  endTime: string | null;
};

/**
 * Locale-aware date/time label. Times present → "day · HH:MM–HH:MM" (permission
 * or a timed presence/permanence). Multi-day → a date range. Otherwise a single
 * day. Kind-agnostic — driven by the stored fields.
 */
export function formatRequestRange(locale: string, r: RangeInput): string {
  const d = (dt: Date) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(dt);
  if (r.startTime && r.endTime) return `${d(r.startDate)} · ${r.startTime}–${r.endTime}`;
  return r.startDate.getTime() === r.endDate.getTime()
    ? d(r.startDate)
    : `${d(r.startDate)} – ${d(r.endDate)}`;
}
