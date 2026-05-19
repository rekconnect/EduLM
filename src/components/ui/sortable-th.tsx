import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { TH } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export function buildSortHref({
  baseUrl,
  currentSort,
  currentDir,
  column,
  preserve,
}: {
  baseUrl: string;
  currentSort: string | undefined;
  currentDir: SortDir | undefined;
  column: string;
  preserve: Record<string, string | undefined>;
}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(preserve)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  // Click same column → flip direction. Click different column → asc.
  const nextDir: SortDir =
    currentSort === column ? (currentDir === "asc" ? "desc" : "asc") : "asc";
  sp.set("sort", column);
  sp.set("dir", nextDir);
  return `${baseUrl}?${sp.toString()}`;
}

export function SortableTH({
  label,
  column,
  currentSort,
  currentDir,
  baseUrl,
  preserve,
  align,
}: {
  label: string;
  column: string;
  currentSort: string | undefined;
  currentDir: SortDir | undefined;
  baseUrl: string;
  preserve: Record<string, string | undefined>;
  align?: "start" | "end";
}) {
  const isActive = currentSort === column;
  const href = buildSortHref({
    baseUrl,
    currentSort,
    currentDir,
    column,
    preserve,
  });
  return (
    <TH className={align === "end" ? "text-end" : undefined}>
      <Link
        href={href}
        scroll={false}
        className={cn(
          "inline-flex items-center gap-1 transition-colors duration-150 ease-out hover:text-[color:var(--color-foreground)]",
          isActive && "text-[color:var(--color-foreground)]",
        )}
      >
        {label}
        {isActive ? (
          currentDir === "asc" ? (
            <ChevronUp className="size-3" aria-hidden />
          ) : (
            <ChevronDown className="size-3" aria-hidden />
          )
        ) : (
          <ChevronsUpDown
            className="size-3 opacity-40 transition-opacity group-hover:opacity-70"
            aria-hidden
          />
        )}
      </Link>
    </TH>
  );
}
