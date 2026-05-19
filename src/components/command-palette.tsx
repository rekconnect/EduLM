"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  School,
  Calendar,
  Receipt,
  CalendarCheck,
  AlertTriangle,
  FileSpreadsheet,
  FolderOpen,
  Megaphone,
  Inbox,
  Settings,
  Sun,
  Moon,
  Monitor,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { SearchResults } from "@/app/api/search/route";

type Ctx = { open: boolean; setOpen: (v: boolean) => void };

const CommandPaletteContext = createContext<Ctx>({
  open: false,
  setOpen: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

type CmdItem = {
  label: string;
  href?: string;
  onSelect?: () => void;
  icon: LucideIcon;
  keywords?: string[];
};

const EMPTY_RESULTS: SearchResults = { parents: [], students: [], classes: [] };

export function CommandPalette({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const tNav = useTranslations("nav");
  const tTheme = useTranslations("theme");
  const { setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset query when the palette closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY_RESULTS);
      setSearching(false);
    }
  }, [open]);

  // Debounced server search. Skips when query is too short.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      const ac = new AbortController();
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        .then((r) => r.json() as Promise<SearchResults>)
        .then((data) => setResults(data))
        .catch(() => {
          /* ignored — including abort errors */
        })
        .finally(() => setSearching(false));
      return () => ac.abort();
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const onThemeChange = useCallback(
    (theme: "light" | "dark" | "system") => {
      setOpen(false);
      setTheme(theme);
    },
    [setTheme],
  );

  const ctxValue = useMemo(() => ({ open, setOpen }), [open]);

  const nav: CmdItem[] = [
    { label: tNav("dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { label: tNav("students"), href: "/students", icon: GraduationCap },
    { label: tNav("parents"), href: "/admin/parents", icon: Users },
    { label: tNav("classes"), href: "/classes", icon: School },
    { label: tNav("attendance"), href: "/attendance", icon: CalendarCheck },
    { label: tNav("discipline"), href: "/discipline", icon: AlertTriangle },
    { label: tNav("billing"), href: "/billing", icon: Receipt },
  ];

  const comms: CmdItem[] = [
    { label: tNav("announcements"), href: "/admin/announcements", icon: Megaphone },
    { label: tNav("documents"), href: "/admin/documents", icon: FolderOpen },
    { label: tNav("messages"), href: "/admin/messages", icon: Inbox },
  ];

  const adminItems: CmdItem[] = [
    { label: tNav("years"), href: "/admin/years", icon: Calendar },
    { label: tNav("admissions"), href: "/admissions-admin", icon: FileSpreadsheet },
    { label: tNav("settings"), href: "/settings", icon: Settings },
  ];

  const hasResults =
    results.parents.length > 0 ||
    results.students.length > 0 ||
    results.classes.length > 0;

  return (
    <CommandPaletteContext.Provider value={ctxValue}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={tNav("cmdkA11yTitle")}
        description={tNav("cmdkPlaceholder")}
      >
        <CommandInput
          placeholder={tNav("cmdkPlaceholder")}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {searching ? (
              <span className="inline-flex items-center gap-2 text-[color:var(--color-foreground-muted)]">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {tNav("cmdkSearching")}
              </span>
            ) : (
              tNav("cmdkEmpty")
            )}
          </CommandEmpty>

          {hasResults ? (
            <CommandGroup heading={tNav("cmdkResults")} forceMount>
              {results.parents.map((p) => (
                <CommandItem
                  key={`parent-${p.id}`}
                  value={`parent ${p.name ?? ""} ${p.email}`}
                  forceMount
                  onSelect={() => go(`/admin/parents/${p.id}`)}
                >
                  <Users
                    className="me-2 size-4 text-[color:var(--color-foreground-muted)]"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[color:var(--color-foreground)]">
                      {p.name ?? p.email}
                    </div>
                    {p.name ? (
                      <div className="truncate text-xs text-[color:var(--color-foreground-muted)]">
                        {p.email}
                      </div>
                    ) : null}
                  </div>
                  <span className="ms-2 shrink-0 text-[10px] uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                    {tNav("parents")}
                  </span>
                </CommandItem>
              ))}
              {results.students.map((s) => (
                <CommandItem
                  key={`student-${s.id}`}
                  value={`student ${s.lastName} ${s.firstName}`}
                  forceMount
                  onSelect={() => go(`/students/${s.id}`)}
                >
                  <GraduationCap
                    className="me-2 size-4 text-[color:var(--color-foreground-muted)]"
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-[color:var(--color-foreground)]">
                    {s.lastName} {s.firstName}
                  </span>
                  <span className="ms-2 shrink-0 text-[10px] uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                    {tNav("students")}
                  </span>
                </CommandItem>
              ))}
              {results.classes.map((c) => (
                <CommandItem
                  key={`class-${c.id}`}
                  value={`class ${c.name} ${c.level} ${c.section}`}
                  forceMount
                  onSelect={() => go(`/classes/${c.id}`)}
                >
                  <School
                    className="me-2 size-4 text-[color:var(--color-foreground-muted)]"
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-[color:var(--color-foreground)]">
                    {c.name}
                  </span>
                  <span className="ms-2 shrink-0 text-[10px] uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                    {tNav("classes")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {hasResults ? <CommandSeparator /> : null}

          <CommandGroup heading={tNav("cmdkNav")}>
            {nav.map((item) => (
              <PaletteItem key={item.href} item={item} onGo={go} />
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={tNav("cmdkCommunication")}>
            {comms.map((item) => (
              <PaletteItem key={item.href} item={item} onGo={go} />
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={tNav("cmdkAdmin")}>
            {adminItems.map((item) => (
              <PaletteItem key={item.href} item={item} onGo={go} />
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={tTheme("toggle")}>
            <CommandItem
              value={`theme-light ${tTheme("light")}`}
              onSelect={() => onThemeChange("light")}
            >
              <Sun className="me-2 size-4" />
              {tTheme("light")}
            </CommandItem>
            <CommandItem
              value={`theme-dark ${tTheme("dark")}`}
              onSelect={() => onThemeChange("dark")}
            >
              <Moon className="me-2 size-4" />
              {tTheme("dark")}
            </CommandItem>
            <CommandItem
              value={`theme-system ${tTheme("system")}`}
              onSelect={() => onThemeChange("system")}
            >
              <Monitor className="me-2 size-4" />
              {tTheme("system")}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </CommandPaletteContext.Provider>
  );
}

function PaletteItem({
  item,
  onGo,
}: {
  item: CmdItem;
  onGo: (href: string) => void;
}) {
  const Icon = item.icon;
  return (
    <CommandItem
      value={`${item.label} ${item.keywords?.join(" ") ?? ""}`}
      onSelect={() => {
        if (item.href) onGo(item.href);
        else item.onSelect?.();
      }}
    >
      <Icon className="me-2 size-4" />
      {item.label}
    </CommandItem>
  );
}
