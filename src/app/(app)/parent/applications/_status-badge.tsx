import { cn } from "@/lib/utils";

type AppStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "INTERVIEW_SCHEDULED"
  | "ACCEPTED"
  | "WAITLISTED"
  | "DECLINED"
  | "WITHDRAWN";

const TONE: Record<AppStatus, string> = {
  DRAFT:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  SUBMITTED:
    "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  UNDER_REVIEW:
    "bg-[color:var(--color-brand-100)] text-[color:var(--color-brand-700)]",
  INTERVIEW_SCHEDULED:
    "bg-[color:var(--color-brand-100)] text-[color:var(--color-brand-700)]",
  ACCEPTED:
    "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  WAITLISTED:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  DECLINED:
    "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger-soft-fg)]",
  WITHDRAWN:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-subtle)]",
};

export function AppStatusBadge({
  status,
  label,
  size = "sm",
  className,
}: {
  status: AppStatus | string;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const tone =
    (TONE as Record<string, string>)[status] ??
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium uppercase tracking-wider",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
