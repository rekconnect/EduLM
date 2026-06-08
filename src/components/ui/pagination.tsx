import Link from "next/link";

/**
 * Server-rendered pager. `params` carries every filter to preserve across
 * page links (q, status, sort, year, …) — `page` is added per link. Renders
 * nothing for an empty result set.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageCount,
  total,
  pageSize,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  if (total === 0) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") sp.set(k, v);
    }
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const prevHref = page > 1 ? href(page - 1) : null;
  const nextHref = page < pageCount ? href(page + 1) : null;

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-xs tabular-nums text-[color:var(--color-foreground-muted)]">
        {from}–{to} sur {total}
      </p>
      <div className="flex items-center gap-2">
        <PageLink href={prevHref} label="Précédent" />
        <span className="text-xs tabular-nums text-[color:var(--color-foreground-muted)]">
          Page {page} / {pageCount}
        </span>
        <PageLink href={nextHref} label="Suivant" />
      </div>
    </div>
  );
}

function PageLink({ href, label }: { href: string | null; label: string }) {
  const cls =
    "inline-flex items-center rounded-md border border-[color:var(--color-border-subtle)] px-3 py-1.5 text-sm font-medium transition-all duration-150 ease-out";
  if (!href) {
    return (
      <span
        aria-disabled
        className={`${cls} cursor-not-allowed text-[color:var(--color-foreground-subtle)] opacity-50`}
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${cls} bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground-muted)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-foreground)] active:scale-[0.98]`}
    >
      {label}
    </Link>
  );
}
