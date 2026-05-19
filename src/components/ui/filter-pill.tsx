import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Single-select filter chip. Renders as a Link so clicking navigates with the
 * relevant URL param set. Active state uses the brand color; non-active can
 * carry a tone class to preview the destination state (e.g., success-soft for
 * "Paid").
 */
export function FilterPill({
  href,
  label,
  active,
  tone,
  size = "sm",
}: {
  href: string;
  label: React.ReactNode;
  active: boolean;
  /** Optional Tailwind class for the inactive state (e.g. a status tone). */
  tone?: string;
  size?: "sm" | "md";
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full font-medium transition-colors duration-150 ease-out",
        size === "sm" ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
        active
          ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] shadow-card"
          : tone ??
              "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
      )}
    >
      {label}
    </Link>
  );
}
