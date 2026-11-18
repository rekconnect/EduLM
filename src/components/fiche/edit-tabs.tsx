"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib/utils";

export type EditTab = {
  id: string;
  label: string;
  /** Pre-rendered icon element, e.g. <User className="size-4" />. */
  icon: React.ReactNode;
  content: React.ReactNode;
};

type EditTabApi = {
  /** This tab now holds changes that are not saved. */
  markDirty: () => void;
  /** This tab's changes are saved (or were reverted). */
  markClean: () => void;
};

const NOOP: EditTabApi = { markDirty: () => {}, markClean: () => {} };
const EditTabContext = createContext<EditTabApi>(NOOP);

/**
 * Lets a form rendered inside an EditTabs panel report unsaved changes, which
 * shows as a dot on its tab. Safe to call anywhere: outside EditTabs both
 * functions do nothing.
 */
export function useEditTab(): EditTabApi {
  return useContext(EditTabContext);
}

/** From this width up the tabs sit in a column beside the form (Tailwind `lg`). */
const SIDE_LAYOUT_QUERY = "(min-width: 1024px)";

function subscribeSideLayout(onChange: () => void) {
  const mq = window.matchMedia(SIDE_LAYOUT_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const sideLayoutNow = () => window.matchMedia(SIDE_LAYOUT_QUERY).matches;
const sideLayoutOnServer = () => false;

/** One memory per page: two parents open in two tabs do not share it. */
const storageKey = () => `edulm:edit-tab:${window.location.pathname}`;

function Panel({
  tab,
  active,
  panelId,
  tabId,
  setDirty,
}: {
  tab: EditTab;
  active: boolean;
  panelId: string;
  tabId: string;
  setDirty: (id: string, dirty: boolean) => void;
}) {
  const api = useMemo<EditTabApi>(
    () => ({
      markDirty: () => setDirty(tab.id, true),
      markClean: () => setDirty(tab.id, false),
    }),
    [setDirty, tab.id],
  );
  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      hidden={!active}
      className="min-w-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
    >
      <EditTabContext.Provider value={api}>{tab.content}</EditTabContext.Provider>
    </div>
  );
}

/**
 * Tabbed layout for an EDIT surface: one form per tab, each with its own Save.
 *
 * Unlike FicheTabs (which mounts only the active section), every panel stays
 * mounted and the inactive ones are merely hidden — so what was typed in one
 * tab is still there after a detour through another. Each form reports its
 * unsaved changes through `useEditTab()`; a tab holding some shows a dot.
 *
 * While any tab is unsaved, leaving asks first: closing or reloading the page
 * (browser prompt) and following a link inside the app (`leaveConfirmLabel`).
 * The browser's Back button is not covered.
 *
 * Tabs sit in a column on the left from `lg` up, and in a scrollable row above
 * the form on narrower screens.
 *
 * The open tab is remembered per page in sessionStorage, so a reload reopens
 * it. It is deliberately NOT mirrored in the URL: the router would then see a
 * different query string on the refresh that follows a save, treat it as a
 * navigation and scroll the page back to the top.
 */
export function EditTabs({
  tabs,
  initialTab,
  ariaLabel,
  unsavedLabel,
  leaveConfirmLabel,
}: {
  tabs: EditTab[];
  /** Tab to open first (from the page's URL); ignored when it matches no tab. */
  initialTab?: string;
  ariaLabel: string;
  /** Screen-reader / tooltip text for the unsaved-changes dot. */
  unsavedLabel: string;
  /** Question asked before following an in-app link with unsaved changes. */
  leaveConfirmLabel: string;
}) {
  const baseId = useId();
  const [active, setActive] = useState(
    () => tabs.find((t) => t.id === initialTab)?.id ?? tabs[0]?.id ?? "",
  );
  const [dirty, setDirtyMap] = useState<Record<string, boolean>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const sideLayout = useSyncExternalStore(
    subscribeSideLayout,
    sideLayoutNow,
    sideLayoutOnServer,
  );

  const setDirty = useCallback((id: string, value: boolean) => {
    setDirtyMap((prev) => (!!prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  // A tab can disappear between renders (config changed): fall back to the first.
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const currentId = current?.id ?? "";

  const anyDirty = tabs.some((t) => dirty[t.id]);
  useEffect(() => {
    if (!anyDirty) return;
    // Set once the admin agreed to leave through a link, so a link that makes
    // the browser load a new page does not ask a second time.
    let leaving = false;
    const warn = (e: BeforeUnloadEvent) => {
      if (leaving) return;
      e.preventDefault();
      // Legacy browsers only show the prompt when returnValue is set.
      e.returnValue = "";
    };
    // In-app links navigate without unloading the page, so `beforeunload`
    // never fires for them. Capture phase: this runs before the link's own
    // click handler, which skips the navigation once the event is cancelled.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if ((target.target && target.target !== "_self") || target.hasAttribute("download")) {
        return;
      }
      let dest: URL;
      try {
        dest = new URL(target.href, window.location.href);
      } catch {
        return;
      }
      // Another site unloads the page: the browser prompt above covers it.
      if (dest.origin !== window.location.origin) return;
      // Same page (an anchor, or the URL already shown): nothing is lost.
      if (
        dest.pathname === window.location.pathname &&
        dest.search === window.location.search
      ) {
        return;
      }
      if (window.confirm(leaveConfirmLabel)) {
        leaving = true;
      } else {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [anyDirty, leaveConfirmLabel]);

  // In the scrollable row (narrow screens) the open tab can start outside the
  // visible part of the strip — after a reload on the last tab, for instance.
  // Only the strip is scrolled, never the page.
  const reveal = useCallback((id: string) => {
    const list = listRef.current;
    const el = tabRefs.current[id];
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    const strip = list.getBoundingClientRect();
    const tab = el.getBoundingClientRect();
    if (tab.left < strip.left) list.scrollLeft -= strip.left - tab.left;
    else if (tab.right > strip.right) list.scrollLeft += tab.right - strip.right;
  }, []);

  // Once, after the first render: reopen the tab this page was last left on.
  // The memory only counts for the URL it was recorded under — a link that
  // names another tab wins.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    let open = currentId;
    try {
      const raw = window.sessionStorage.getItem(storageKey());
      const memo = raw ? (JSON.parse(raw) as { id?: unknown; from?: unknown }) : null;
      if (
        memo &&
        typeof memo.id === "string" &&
        memo.from === (initialTab ?? null) &&
        tabs.some((t) => t.id === memo.id)
      ) {
        open = memo.id;
        setActive(memo.id);
      }
    } catch {
      /* No storage (private mode, blocked): the tab from the URL stays. */
    }
    reveal(open);
  }, [currentId, initialTab, reveal, tabs]);

  function select(id: string, focus = false) {
    setActive(id);
    if (focus) tabRefs.current[id]?.focus();
    reveal(id);
    try {
      window.sessionStorage.setItem(
        storageKey(),
        JSON.stringify({ id, from: initialTab ?? null }),
      );
    } catch {
      /* Remembering the tab is a convenience — never block the switch on it. */
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === currentId);
    if (i < 0) return;
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    let next = -1;
    switch (e.key) {
      case "ArrowDown":
        next = (i + 1) % tabs.length;
        break;
      case "ArrowUp":
        next = (i - 1 + tabs.length) % tabs.length;
        break;
      case "ArrowRight":
        next = (i + (rtl ? -1 : 1) + tabs.length) % tabs.length;
        break;
      case "ArrowLeft":
        next = (i + (rtl ? 1 : -1) + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    const target = tabs[next];
    if (!target) return;
    e.preventDefault();
    select(target.id, true);
  }

  if (tabs.length === 0) return null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation={sideLayout ? "vertical" : "horizontal"}
        onKeyDown={onKeyDown}
        className="flex gap-0.5 self-start overflow-x-auto rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-2 shadow-card lg:flex-col lg:overflow-visible"
      >
        {tabs.map((t, index) => {
          const isActive = t.id === currentId;
          const isDirty = !!dirty[t.id];
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              // DOM ids go by position: a tab id may come from tenant config
              // and hold characters an id reference cannot.
              id={`${baseId}-tab-${index}`}
              aria-selected={isActive}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-start text-sm outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)] lg:shrink lg:whitespace-normal",
                isActive
                  ? "bg-[color:var(--color-brand-50)] font-semibold text-[color:var(--color-brand-700)]"
                  : "text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]",
              )}
            >
              <span
                className={cn(
                  "shrink-0",
                  isActive
                    ? "text-[color:var(--color-brand-600)]"
                    : "text-[color:var(--color-foreground-subtle)]",
                )}
              >
                {t.icon}
              </span>
              <span className="min-w-0 flex-1 lg:truncate">{t.label}</span>
              {isDirty ? (
                <span
                  title={unsavedLabel}
                  // The darker rim keeps the dot readable on both the plain
                  // and the selected tab background.
                  className="inline-flex size-2 shrink-0 rounded-full bg-[color:var(--color-warning)] ring-1 ring-[color:var(--color-warning-soft-fg)]"
                >
                  <span className="sr-only">{unsavedLabel}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        {tabs.map((t, index) => (
          <Panel
            key={t.id}
            tab={t}
            active={t.id === currentId}
            panelId={`${baseId}-panel-${index}`}
            tabId={`${baseId}-tab-${index}`}
            setDirty={setDirty}
          />
        ))}
      </div>
    </div>
  );
}
