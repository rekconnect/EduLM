import type { LucideIcon } from "lucide-react";

/**
 * Section heading with a brand-colored icon next to the title. Shared by the
 * parent fiche and the student fiche so both pages look the same.
 */
export function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-4 text-[color:var(--color-brand-600)]" aria-hidden />
      <h2 className="text-sm font-semibold tracking-tight text-[color:var(--color-foreground)]">
        {children}
      </h2>
    </div>
  );
}
