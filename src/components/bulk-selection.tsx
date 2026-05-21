"use client";

/**
 * Generic bulk-selection scaffolding for admin lists.
 *
 * Usage on a page:
 *   <BulkSelectionProvider allIds={ids}>
 *     <YourToolbar />               // consumes useBulkSelection()
 *     <Table>
 *       <THead>
 *         <tr><TH><BulkHeaderCheckbox /></TH>...</tr>
 *       </THead>
 *       <tbody>
 *         {rows.map(r => (
 *           <TR><TD><BulkRowCheckbox id={r.id}/></TD>...</TR>
 *         ))}
 *       </tbody>
 *     </Table>
 *   </BulkSelectionProvider>
 *
 * The provider re-keys when `allIds` changes (e.g. tab switch, filter
 * change) so selection doesn't bleed across views.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Check, Minus } from "lucide-react";

type Ctx = {
  selected: Set<string>;
  allIds: readonly string[];
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
  count: number;
  allSelected: boolean;
  someSelected: boolean;
};

const BulkContext = createContext<Ctx | null>(null);

export function BulkSelectionProvider({
  allIds,
  children,
}: {
  allIds: readonly string[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Drop stale IDs whenever the visible row-set changes (tab switch, filter).
  // Keeps "selected" honest — you can't act on rows that aren't loaded.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(allIds);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [allIds]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  }, [allIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const value: Ctx = useMemo(
    () => ({
      selected,
      allIds,
      toggle,
      toggleAll,
      clear,
      isSelected: (id) => selected.has(id),
      count: selected.size,
      allSelected: allIds.length > 0 && selected.size === allIds.length,
      someSelected: selected.size > 0 && selected.size < allIds.length,
    }),
    [selected, allIds, toggle, toggleAll, clear],
  );

  return <BulkContext.Provider value={value}>{children}</BulkContext.Provider>;
}

export function useBulkSelection(): Ctx {
  const ctx = useContext(BulkContext);
  if (!ctx) {
    throw new Error(
      "useBulkSelection must be used inside a <BulkSelectionProvider>",
    );
  }
  return ctx;
}

/** Per-row checkbox. Stops propagation so the row's <Link> doesn't fire. */
export function BulkRowCheckbox({
  id,
  ariaLabel,
}: {
  id: string;
  ariaLabel: string;
}) {
  const { isSelected, toggle } = useBulkSelection();
  const checked = isSelected(id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        toggle(id);
      }}
      className={
        checked
          ? "flex size-4 items-center justify-center rounded border border-[color:var(--color-brand-600)] bg-[color:var(--color-brand-600)] text-white transition-colors"
          : "flex size-4 items-center justify-center rounded border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] text-transparent transition-colors hover:border-[color:var(--color-brand-600)]"
      }
    >
      {checked ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}

/** Header checkbox: empty / indeterminate / all-checked. */
export function BulkHeaderCheckbox({ ariaLabel }: { ariaLabel: string }) {
  const { allSelected, someSelected, toggleAll, allIds } = useBulkSelection();
  const disabled = allIds.length === 0;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={allSelected ? true : someSelected ? "mixed" : false}
      aria-label={ariaLabel}
      onClick={toggleAll}
      disabled={disabled}
      className={
        allSelected || someSelected
          ? "flex size-4 items-center justify-center rounded border border-[color:var(--color-brand-600)] bg-[color:var(--color-brand-600)] text-white transition-colors disabled:opacity-40"
          : "flex size-4 items-center justify-center rounded border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] text-transparent transition-colors hover:border-[color:var(--color-brand-600)] disabled:opacity-40"
      }
    >
      {allSelected ? (
        <Check className="size-3" strokeWidth={3} aria-hidden />
      ) : someSelected ? (
        <Minus className="size-3" strokeWidth={3} aria-hidden />
      ) : null}
    </button>
  );
}
