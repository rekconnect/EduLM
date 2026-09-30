"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Building2,
  Check,
  ChevronDown,
  GraduationCap,
  Info,
  Layers,
  ListChecks,
  Loader2,
  School,
  Search,
  TriangleAlert,
  User,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  previewAudience,
  searchRecipients,
} from "@/app/(app)/admin/messages/_actions";
import {
  isEmptyAudience,
  parseAudienceSpec,
  type AudiencePreview,
  type AudienceSpec,
  type PickerClass,
  type PickerEstablishment,
  type PickerRecipient,
} from "@/lib/messaging-shared";

/**
 * Recipient picker for the staff messagerie (and the announcement composer).
 *
 * Controlled: `value` is an AudienceSpec (a UNION of clauses), every change
 * goes out through `onChange` as a NEW, sanitized object (parseAudienceSpec
 * dedupes ids and drops empty arrays). Group clauses (all / establishments /
 * levels / classes) resolve server-side against the active year; parents and
 * families are explicit picks found through the search box.
 */
export type RecipientPickerProps = {
  establishments: PickerEstablishment[];
  /** Active-year levels, already sorted. */
  levels: string[];
  /** Active-year classes. */
  classes: PickerClass[];
  value: AudienceSpec;
  onChange: (next: AudienceSpec) => void;
  /** Show the "Toute l'école" switch (communication: full). */
  allowAll: boolean;
  disabled?: boolean;
  /** Live "→ N parents" preview. Default true. */
  showPreview?: boolean;
  /** Labels for pre-selected parent / family ids (chips). */
  initialLabels?: Record<string, string>;
  /**
   * Optional: receives the live preview for the CURRENT value, or null while
   * it is being (re)computed, when the audience is empty, or on error.
   * Only fires when showPreview is on.
   */
  onPreview?: (preview: AudiencePreview | null) => void;
};

const SEARCH_DEBOUNCE_MS = 250;
const PREVIEW_DEBOUNCE_MS = 300;

const CHECKBOX =
  "size-4 shrink-0 rounded border-[color:var(--color-border-strong)] accent-[color:var(--color-brand-600)] disabled:cursor-not-allowed";

function withId(list: string[] | undefined, id: string): string[] {
  const cur = list ?? [];
  return cur.includes(id) ? cur : [...cur, id];
}

function withoutId(list: string[] | undefined, id: string): string[] {
  return (list ?? []).filter((x) => x !== id);
}

function toggleId(list: string[] | undefined, id: string): string[] {
  return (list ?? []).includes(id) ? withoutId(list, id) : withId(list, id);
}

type ChipKind = "all" | "establishment" | "level" | "class" | "family" | "parent";

const CHIP_ICON: Record<ChipKind, typeof User> = {
  all: School,
  establishment: Building2,
  level: Layers,
  class: GraduationCap,
  family: Users,
  parent: User,
};

type Chip = {
  key: string;
  kind: ChipKind;
  label: string;
  onRemove: () => void;
};

type SearchState = {
  q: string;
  status: "done" | "error";
  results: PickerRecipient[];
};

type PreviewState = {
  key: string;
  data: AudiencePreview | null;
  error: boolean;
};

function Section({
  icon,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 px-4 py-4">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-foreground-subtle)]">
          {icon}
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function RecipientPicker({
  establishments,
  levels,
  classes,
  value,
  onChange,
  allowAll,
  disabled = false,
  showPreview = true,
  initialLabels,
  onPreview,
}: RecipientPickerProps) {
  const t = useTranslations("messaging.picker");
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  // ── Derived lookups ────────────────────────────────────────────────
  const estById = useMemo(
    () => new Map(establishments.map((e) => [e.id, e])),
    [establishments],
  );
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const groups = useMemo(() => {
    const map = new Map<string, PickerClass[]>();
    for (const l of levels) map.set(l, []);
    for (const c of classes) {
      const arr = map.get(c.level);
      if (arr) arr.push(c);
      else map.set(c.level, [c]);
    }
    return [...map.entries()]
      .filter(([, cs]) => cs.length > 0)
      .map(([level, cs]) => ({ level, classes: cs }));
  }, [levels, classes]);

  const selectedClassIds = useMemo(() => new Set(value.classIds ?? []), [value.classIds]);
  const selectedLevels = useMemo(() => new Set(value.levels ?? []), [value.levels]);
  const selectedEst = useMemo(
    () => new Set(value.establishmentIds ?? []),
    [value.establishmentIds],
  );

  const allOn = !!value.all;
  const groupsCollapsed = allOn && allowAll;
  const empty = isEmptyAudience(value);

  // Labels of explicitly picked parents / families (remembered from search).
  const [labels, setLabels] = useState<Record<string, string>>({});
  const labelFor = (id: string): string | undefined => labels[id] ?? initialLabels?.[id];

  const emit = (next: AudienceSpec) => onChange(parseAudienceSpec(next));

  // ── "Toute l'école" ─────────────────────────────────────────────────
  // Turning it ON clears the (now redundant) group clauses but stashes them,
  // so turning it back OFF restores what the user had picked.
  const stashRef = useRef<AudienceSpec | null>(null);

  function toggleAll() {
    if (!allOn) {
      stashRef.current = {
        establishmentIds: value.establishmentIds,
        levels: value.levels,
        classIds: value.classIds,
      };
      emit({ all: true, familyIds: value.familyIds, parentUserIds: value.parentUserIds });
    } else {
      const stash = stashRef.current;
      stashRef.current = null;
      emit({
        ...value,
        all: false,
        establishmentIds: stash?.establishmentIds ?? value.establishmentIds,
        levels: stash?.levels ?? value.levels,
        classIds: stash?.classIds ?? value.classIds,
      });
    }
  }

  // ── Groups ─────────────────────────────────────────────────────────
  function toggleEstablishment(id: string) {
    emit({ ...value, establishmentIds: toggleId(value.establishmentIds, id) });
  }

  /** Adding a whole level supersedes individual classes of that level. */
  function toggleLevel(level: string) {
    if (selectedLevels.has(level)) {
      emit({ ...value, levels: withoutId(value.levels, level) });
      return;
    }
    const levelClassIds = new Set(classes.filter((c) => c.level === level).map((c) => c.id));
    emit({
      ...value,
      levels: withId(value.levels, level),
      classIds: (value.classIds ?? []).filter((id) => !levelClassIds.has(id)),
    });
  }

  function toggleClass(id: string) {
    emit({ ...value, classIds: toggleId(value.classIds, id) });
  }

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const id of value.classIds ?? []) {
      const c = classes.find((x) => x.id === id);
      if (c) open.add(c.level);
    }
    return open;
  });

  function toggleExpanded(level: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  // ── Search (parents + families) ────────────────────────────────────
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [search, setSearch] = useState<SearchState | null>(null);
  const searchSeq = useRef(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    // Every keystroke invalidates in-flight responses (race-safe).
    const seq = ++searchSeq.current;
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      searchRecipients(trimmed).then(
        (results) => {
          if (seq !== searchSeq.current) return;
          setSearch({ q: trimmed, status: "done", results });
          setActive(0);
        },
        () => {
          if (seq !== searchSeq.current) return;
          setSearch({ q: trimmed, status: "error", results: [] });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!searchBoxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const searchLoading = trimmed.length >= 2 && search?.q !== trimmed;
  const searchCurrent = search && search.q === trimmed ? search : null;
  // While a new query loads, keep showing the previous hits (dimmed) instead
  // of flashing an empty list.
  const visible: PickerRecipient[] =
    trimmed.length < 2 ? [] : (searchCurrent?.results ?? search?.results ?? []);
  const activeIdx = visible.length ? Math.min(active, visible.length - 1) : -1;
  const showDropdown = open && trimmed.length >= 1;

  function isPicked(r: PickerRecipient): boolean {
    return r.kind === "parent"
      ? !!value.parentUserIds?.includes(r.id)
      : !!value.familyIds?.includes(r.id);
  }

  function pick(r: PickerRecipient) {
    setLabels((prev) => (prev[r.id] === r.label ? prev : { ...prev, [r.id]: r.label }));
    if (r.kind === "parent") {
      emit({ ...value, parentUserIds: toggleId(value.parentUserIds, r.id) });
    } else {
      emit({ ...value, familyIds: toggleId(value.familyIds, r.id) });
    }
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(visible.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Never let Enter submit a surrounding form.
      e.preventDefault();
      const hit = activeIdx >= 0 ? visible[activeIdx] : undefined;
      if (showDropdown && hit) pick(hit);
    } else if (e.key === "Escape") {
      if (showDropdown) {
        e.preventDefault();
        setOpen(false);
      } else if (query) {
        e.preventDefault();
        setQuery("");
      }
    }
  }

  // ── Live preview ───────────────────────────────────────────────────
  const specKey = useMemo(() => JSON.stringify(parseAudienceSpec(value)), [value]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const previewSeq = useRef(0);

  useEffect(() => {
    const seq = ++previewSeq.current;
    if (!showPreview) return;
    const spec = JSON.parse(specKey) as AudienceSpec;
    if (isEmptyAudience(spec)) return;
    const timer = setTimeout(() => {
      previewAudience(spec).then(
        (data) => {
          if (seq !== previewSeq.current) return;
          setPreview({ key: specKey, data, error: false });
        },
        () => {
          if (seq !== previewSeq.current) return;
          setPreview({ key: specKey, data: null, error: true });
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [specKey, showPreview]);

  const previewCurrent = preview && preview.key === specKey ? preview : null;
  const previewData = previewCurrent?.data ?? null;
  const previewLoading = showPreview && !empty && !previewCurrent;
  // Last known figure, shown dimmed while the new one is computed.
  const previewStale = previewLoading ? (preview?.data ?? null) : null;

  const onPreviewRef = useRef(onPreview);
  useEffect(() => {
    onPreviewRef.current = onPreview;
  });
  useEffect(() => {
    if (!showPreview) return;
    onPreviewRef.current?.(empty ? null : previewData);
  }, [previewData, empty, showPreview]);

  // ── Selection summary chips ────────────────────────────────────────
  const chips: Chip[] = [];
  if (allOn) {
    chips.push({
      key: "all",
      kind: "all",
      label: t("allTitle"),
      onRemove: () => {
        stashRef.current = null;
        emit({ ...value, all: false });
      },
    });
  }
  for (const id of value.establishmentIds ?? []) {
    chips.push({
      key: `e:${id}`,
      kind: "establishment",
      label: estById.get(id)?.name ?? t("unknownEstablishment"),
      onRemove: () => emit({ ...value, establishmentIds: withoutId(value.establishmentIds, id) }),
    });
  }
  for (const level of value.levels ?? []) {
    chips.push({
      key: `l:${level}`,
      kind: "level",
      label: t("levelChip", { level }),
      onRemove: () => emit({ ...value, levels: withoutId(value.levels, level) }),
    });
  }
  for (const id of value.classIds ?? []) {
    chips.push({
      key: `c:${id}`,
      kind: "class",
      label: classById.get(id)?.name ?? t("unknownClass"),
      onRemove: () => emit({ ...value, classIds: withoutId(value.classIds, id) }),
    });
  }
  for (const id of value.familyIds ?? []) {
    chips.push({
      key: `f:${id}`,
      kind: "family",
      label: labelFor(id) ?? t("unknownFamily"),
      onRemove: () => emit({ ...value, familyIds: withoutId(value.familyIds, id) }),
    });
  }
  for (const id of value.parentUserIds ?? []) {
    chips.push({
      key: `p:${id}`,
      kind: "parent",
      label: labelFor(id) ?? t("unknownParent"),
      onRemove: () => emit({ ...value, parentUserIds: withoutId(value.parentUserIds, id) }),
    });
  }

  const noGroups = levels.length === 0 && classes.length === 0;

  return (
    <fieldset
      disabled={disabled}
      className={cn(
        "min-w-0 divide-y divide-[color:var(--color-border-subtle)] rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] transition-opacity duration-200 ease-out",
        disabled && "opacity-60",
      )}
    >
      {/* a) Whole school */}
      {allowAll ? (
        <div className="p-4">
          <button
            type="button"
            role="switch"
            aria-checked={allOn}
            onClick={toggleAll}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-start transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-500)]/40 disabled:cursor-not-allowed",
              allOn
                ? "border-[color:var(--color-brand-500)]/50 bg-[color:var(--color-brand-50)]"
                : "border-[color:var(--color-border-subtle)] hover:bg-[color:var(--color-surface-sunken)]",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ease-out",
                allOn
                  ? "bg-[color:var(--color-brand-600)] text-white"
                  : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
              )}
            >
              <School className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[color:var(--color-foreground)]">
                {t("allTitle")}
              </span>
              <span className="block text-xs text-[color:var(--color-foreground-muted)]">
                {t("allHint")}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-out",
                allOn
                  ? "bg-[color:var(--color-brand-600)]"
                  : "bg-[color:var(--color-border-strong)]",
              )}
            >
              <span
                className={cn(
                  "absolute start-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
                  allOn ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0",
                )}
              />
            </span>
          </button>
        </div>
      ) : null}

      {groupsCollapsed ? (
        <div className="flex items-start gap-2.5 px-4 py-3.5 text-sm text-[color:var(--color-foreground-muted)] animate-in fade-in-0 duration-200 motion-reduce:animate-none">
          <Info
            className="mt-0.5 size-4 shrink-0 text-[color:var(--color-brand-600)]"
            aria-hidden
          />
          <p>{t("allIncludes")}</p>
        </div>
      ) : (
        <>
          {/* b) Establishments */}
          {establishments.length > 0 ? (
            <Section
              icon={<Building2 className="size-3.5" aria-hidden />}
              title={t("establishments")}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {establishments.map((e) => {
                  const checked = selectedEst.has(e.id);
                  return (
                    <label
                      key={e.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ease-out",
                        checked
                          ? "border-[color:var(--color-brand-500)]/40 bg-[color:var(--color-brand-50)]/60 text-[color:var(--color-foreground)]"
                          : "border-[color:var(--color-border-subtle)] text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-sunken)]",
                      )}
                    >
                      <input
                        type="checkbox"
                        className={CHECKBOX}
                        checked={checked}
                        onChange={() => toggleEstablishment(e.id)}
                      />
                      <span className="truncate">{e.name}</span>
                    </label>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {noGroups ? (
            <div className="flex items-start gap-2.5 px-4 py-3.5 text-sm text-[color:var(--color-foreground-muted)]">
              <Info
                className="mt-0.5 size-4 shrink-0 text-[color:var(--color-foreground-subtle)]"
                aria-hidden
              />
              <p>{t("noActiveYear")}</p>
            </div>
          ) : (
            <>
              {/* c) Levels */}
              <Section icon={<Layers className="size-3.5" aria-hidden />} title={t("levels")}>
                <div className="flex flex-wrap gap-1.5">
                  {levels.map((level) => {
                    const on = selectedLevels.has(level);
                    return (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleLevel(level)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-500)]/40 disabled:cursor-not-allowed",
                          on
                            ? "border-[color:var(--color-brand-500)]/50 bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]"
                            : "border-[color:var(--color-border-subtle)] text-[color:var(--color-foreground-muted)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-foreground)]",
                        )}
                      >
                        {on ? <Check className="size-3" aria-hidden /> : null}
                        {level}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* d) Classes grouped by level */}
              <Section
                icon={<GraduationCap className="size-3.5" aria-hidden />}
                title={t("classes")}
              >
                {groups.length === 0 ? (
                  <p className="text-sm text-[color:var(--color-foreground-subtle)]">
                    {t("noClasses")}
                  </p>
                ) : (
                  <div className="max-h-80 divide-y divide-[color:var(--color-border-subtle)] overflow-y-auto rounded-lg border border-[color:var(--color-border-subtle)]">
                    {groups.map(({ level, classes: levelClasses }) => {
                      const isOpen = expanded.has(level);
                      const wholeLevel = selectedLevels.has(level);
                      const picked = levelClasses.filter((c) =>
                        selectedClassIds.has(c.id),
                      ).length;
                      const panelId = `${baseId}-level-${level}`;
                      return (
                        <div key={level}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-controls={panelId}
                              onClick={() => toggleExpanded(level)}
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-start text-sm font-medium text-[color:var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-500)]/40"
                            >
                              <ChevronDown
                                className={cn(
                                  "size-4 shrink-0 text-[color:var(--color-foreground-subtle)] transition-transform duration-200 ease-out",
                                  isOpen ? "rotate-0" : "-rotate-90 rtl:rotate-90",
                                )}
                                aria-hidden
                              />
                              <span className="truncate">{level}</span>
                              <span className="shrink-0 text-xs font-normal text-[color:var(--color-foreground-subtle)]">
                                {t("classCount", { count: levelClasses.length })}
                              </span>
                              {wholeLevel ? (
                                <span className="shrink-0 rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--color-brand-700)]">
                                  {t("wholeLevelBadge")}
                                </span>
                              ) : picked > 0 ? (
                                <span className="shrink-0 rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[color:var(--color-brand-700)]">
                                  {t("classesSelected", { count: picked })}
                                </span>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              aria-pressed={wholeLevel}
                              onClick={() => toggleLevel(level)}
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-500)]/40 disabled:cursor-not-allowed",
                                wholeLevel
                                  ? "bg-[color:var(--color-brand-600)] text-white hover:bg-[color:var(--color-brand-700)]"
                                  : "text-[color:var(--color-brand-700)] hover:bg-[color:var(--color-brand-50)]",
                              )}
                            >
                              {wholeLevel ? <Check className="size-3" aria-hidden /> : null}
                              {t("wholeLevel")}
                            </button>
                          </div>
                          {isOpen ? (
                            <div
                              id={panelId}
                              className="grid gap-1 px-3 pb-3 ps-9 animate-in fade-in-0 duration-150 motion-reduce:animate-none sm:grid-cols-2 lg:grid-cols-3"
                            >
                              {levelClasses.map((c) => {
                                const checked = wholeLevel || selectedClassIds.has(c.id);
                                return (
                                  <label
                                    key={c.id}
                                    title={wholeLevel ? t("includedViaLevel") : undefined}
                                    className={cn(
                                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 ease-out",
                                      wholeLevel
                                        ? "cursor-default text-[color:var(--color-foreground-subtle)]"
                                        : "cursor-pointer text-[color:var(--color-foreground)] hover:bg-[color:var(--color-surface-sunken)]",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      className={CHECKBOX}
                                      checked={checked}
                                      disabled={wholeLevel}
                                      onChange={() => toggleClass(c.id)}
                                    />
                                    <span className="truncate">{c.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
        </>
      )}

      {/* e) Search parents / families */}
      <Section icon={<Search className="size-3.5" aria-hidden />} title={t("search")}>
        <div ref={searchBoxRef} className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-foreground-subtle)]"
            aria-hidden
          />
          <input
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              showDropdown && activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined
            }
            aria-label={t("search")}
            autoComplete="off"
            value={query}
            placeholder={t("searchPlaceholder")}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onSearchKeyDown}
            className="block h-10 w-full rounded-md border border-[color:var(--color-border-subtle)] bg-transparent py-2 pe-9 ps-9 text-sm outline-none transition placeholder:text-[color:var(--color-foreground-subtle)] focus:border-[color:var(--color-brand-500)] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center">
            {searchLoading ? (
              <Loader2
                className="me-1 size-4 animate-spin text-[color:var(--color-foreground-subtle)]"
                aria-hidden
              />
            ) : query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setOpen(false);
                }}
                aria-label={t("clearSearch")}
                className="rounded p-1 text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </span>

          {showDropdown ? (
            <div
              className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              {trimmed.length < 2 ? (
                <p className="px-3 py-2.5 text-xs text-[color:var(--color-foreground-subtle)]">
                  {t("searchMinChars")}
                </p>
              ) : searchCurrent?.status === "error" ? (
                <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-[color:var(--color-danger)]">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                  {t("searchError")}
                </p>
              ) : visible.length === 0 ? (
                <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-[color:var(--color-foreground-subtle)]">
                  {searchLoading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      {t("searching")}
                    </>
                  ) : (
                    t("searchNoResults", { query: trimmed })
                  )}
                </p>
              ) : null}
              <ul
                id={listboxId}
                role="listbox"
                aria-label={t("search")}
                className={cn(
                  "max-h-72 overflow-y-auto p-1 transition-opacity duration-150 ease-out",
                  visible.length === 0 && "hidden",
                  searchLoading && "opacity-60",
                )}
              >
                {visible.map((r, i) => {
                  const picked = isPicked(r);
                  const Icon = r.kind === "parent" ? User : Users;
                  return (
                    <li
                      key={`${r.kind}:${r.id}`}
                      id={`${listboxId}-opt-${i}`}
                      role="option"
                      aria-selected={picked}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(r)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors duration-150 ease-out",
                        i === activeIdx && "bg-[color:var(--color-surface-sunken)]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          r.kind === "parent"
                            ? "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]"
                            : "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[color:var(--color-foreground)]">
                          {r.label}
                        </span>
                        <span className="block truncate text-xs text-[color:var(--color-foreground-subtle)]">
                          {r.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-foreground-subtle)]">
                        {r.kind === "parent" ? t("kindParent") : t("kindFamily")}
                      </span>
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ease-out",
                          picked
                            ? "bg-[color:var(--color-brand-600)] text-white"
                            : "border border-[color:var(--color-border-strong)]",
                        )}
                        title={picked ? t("added") : undefined}
                      >
                        {picked ? <Check className="size-3" aria-hidden /> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-[color:var(--color-foreground-subtle)]">{t("searchHint")}</p>
      </Section>

      {/* f) Selection summary */}
      <Section
        icon={<ListChecks className="size-3.5" aria-hidden />}
        title={t("selection")}
        aside={
          chips.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                stashRef.current = null;
                emit({});
              }}
              className="rounded-md px-2 py-0.5 text-xs font-medium text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)] disabled:cursor-not-allowed"
            >
              {t("clearAll")}
            </button>
          ) : null
        }
      >
        {chips.length === 0 ? (
          <p className="text-sm text-[color:var(--color-foreground-subtle)]">
            {t("selectionEmpty")}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const Icon = CHIP_ICON[chip.kind];
              const individual = chip.kind === "family" || chip.kind === "parent";
              return (
                <li
                  key={chip.key}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pe-1 ps-2.5 text-xs font-medium animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none",
                    individual
                      ? "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground)]"
                      : "border-[color:var(--color-brand-500)]/30 bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
                  )}
                >
                  <Icon className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={t("remove", { label: chip.label })}
                    className="rounded-full p-0.5 opacity-70 transition-opacity duration-150 ease-out hover:opacity-100 disabled:cursor-not-allowed"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* g) Live preview */}
      {showPreview ? (
        <div
          aria-live="polite"
          className={cn(
            "rounded-b-xl px-4 py-3 text-sm transition-colors duration-200 ease-out",
            !empty && !previewLoading && previewCurrent && !previewCurrent.error && previewData?.count === 0
              ? "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]"
              : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
          )}
        >
          {empty ? (
            <p className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-[color:var(--color-foreground-subtle)]" aria-hidden />
              {t("previewEmpty")}
            </p>
          ) : previewLoading ? (
            <p className="flex items-center gap-2">
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              {previewStale ? (
                <span className="font-semibold tabular-nums text-[color:var(--color-foreground)] opacity-60">
                  {t("previewCount", { count: previewStale.count })}
                </span>
              ) : (
                t("previewLoading")
              )}
            </p>
          ) : previewCurrent?.error || !previewData ? (
            <p className="flex items-center gap-2">
              <TriangleAlert className="size-4 shrink-0 text-[color:var(--color-warning)]" aria-hidden />
              {t("previewError")}
            </p>
          ) : previewData.count === 0 ? (
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {t("previewNone")}
            </p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold tabular-nums text-[color:var(--color-brand-700)]">
                {t("previewCount", { count: previewData.count })}
              </span>
              {previewData.sample.length > 0 ? (
                <span className="min-w-0 text-xs text-[color:var(--color-foreground-subtle)]">
                  {previewData.sample.join(", ")}
                  {previewData.count > previewData.sample.length
                    ? ` ${t("previewMore", { count: previewData.count - previewData.sample.length })}`
                    : ""}
                </span>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}
