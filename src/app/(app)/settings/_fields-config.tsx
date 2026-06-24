"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  CROSS_FIELD_LOOKUP_TYPES,
  DEFAULT_PARENT_CATEGORIES,
  DEFAULT_STUDENT_CATEGORIES,
  DOSSIER_BOUND_PROPS,
  DYNAMIC_LOOKUP_TYPES,
  FIELD_TYPES,
  PRESET_LOOKUP_TYPES,
  USER_BOUND_PROPS,
  slugifyKey,
  type DossierBoundProp,
  type EntityFieldsConfig,
  type EntityType,
  type FieldCategory,
  type FieldDef,
  type FieldType,
  type UserBoundProp,
} from "@/lib/entity-fields";
import { presetOptionsForType } from "@/lib/lookups";
import { FieldsRenderer } from "@/components/fields-renderer";
import { updateEntityFieldsConfig } from "./_actions";

type Props = {
  entity: EntityType;
  initial: EntityFieldsConfig;
  /** Parent fields (key + label) — feeds the student "inherit from father"
   *  picker. Only passed for the student editor. */
  parentFieldOptions?: { key: string; label: string }[];
  /** When set, only categories with these names are shown (preview + list +
   *  quick-add). Lets the parent-tab layout scope one entity's editor to the
   *  categories that land on a given parent tab. The full config is still
   *  saved — this only filters the rendered view. */
  visibleCategoryNames?: string[];
  /** Optional banner rendered above the editor (e.g. "parent shows a hardcoded
   *  version of this tab"). */
  notice?: React.ReactNode;
};

/** Tiny stable id generator — sufficient for client-side ids. */
function newId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function FieldsConfigForm({
  entity,
  initial,
  parentFieldOptions,
  visibleCategoryNames,
  notice,
}: Props) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();

  // Bootstrap with default categories if the tenant has no config yet.
  const [categories, setCategories] = useState<FieldCategory[]>(() => {
    if (initial.categories.length > 0) return initial.categories;
    const defaults =
      entity === "parent"
        ? DEFAULT_PARENT_CATEGORIES
        : DEFAULT_STUDENT_CATEGORIES;
    return defaults.map((c) => ({ ...c, id: newId() }));
  });
  const [fields, setFields] = useState<FieldDef[]>(initial.fields);

  // Track which categories are expanded — collapsed by default keeps the
  // page calm; admin opens what they need.
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  function toggleCat(id: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Category mutations ───────────────────────────────
  function addCategory() {
    const id = newId();
    setCategories((prev) => [
      ...prev,
      { id, name: t("fieldsConfig.newCategory"), order: prev.length, active: true },
    ]);
    setOpenCats((prev) => new Set(prev).add(id));
  }
  function updateCategory(id: string, patch: Partial<FieldCategory>) {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }
  function removeCategory(id: string) {
    // Also drop fields in this category — orphaned fields would be filtered
    // server-side anyway, this just keeps local state consistent.
    setFields((prev) => prev.filter((f) => f.categoryId !== id));
    setCategories((prev) =>
      prev.filter((c) => c.id !== id).map((c, i) => ({ ...c, order: i })),
    );
  }
  function moveCategory(id: string, dir: -1 | 1) {
    setCategories((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next.map((c, i) => ({ ...c, order: i }));
    });
  }

  // ── Field mutations ──────────────────────────────────
  function addField(categoryId: string): string {
    const id = newId();
    setFields((prev) => [
      ...prev,
      {
        id,
        key: "",
        label: "",
        type: "short_text",
        required: false,
        categoryId,
        order: prev.filter((f) => f.categoryId === categoryId).length,
      },
    ]);
    return id;
  }
  function updateField(id: string, patch: Partial<FieldDef>) {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        // Auto-slug key from label until the admin manually edits the key.
        if (patch.label !== undefined && (!f.key || f.key === slugifyKey(f.label))) {
          next.key = slugifyKey(patch.label);
        }
        return next;
      }),
    );
  }
  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }
  function moveField(id: string, dir: -1 | 1) {
    setFields((prev) => {
      const target = prev.find((f) => f.id === id);
      if (!target) return prev;
      // Reorder only within the same category. CRITICAL: sort by order so
      // that "adjacent in the rendered list" really means adjacent here —
      // the raw `prev` array doesn't track display order after swaps.
      const inCat = prev
        .filter((f) => f.categoryId === target.categoryId)
        .sort((a, b) => a.order - b.order);
      const localIdx = inCat.findIndex((f) => f.id === id);
      const swapWith = inCat[localIdx + dir];
      if (!swapWith) return prev;
      // Swap the two fields' order values, then renumber 0..N inside the
      // category so the values stay tidy after repeated moves.
      const swappedById = new Map<string, number>();
      const visualNext = [...inCat];
      [visualNext[localIdx], visualNext[localIdx + dir]] = [
        visualNext[localIdx + dir]!,
        visualNext[localIdx]!,
      ];
      visualNext.forEach((f, i) => swappedById.set(f.id, i));
      return prev.map((f) =>
        swappedById.has(f.id)
          ? { ...f, order: swappedById.get(f.id)! }
          : f,
      );
    });
  }

  // Move a field to a different category, placing it at the end of the target.
  function changeFieldCategory(id: string, newCatId: string) {
    setFields((prev) => {
      const target = prev.find((f) => f.id === id);
      if (!target || target.categoryId === newCatId) return prev;
      const endOrder = prev.filter((f) => f.categoryId === newCatId).length;
      return prev.map((f) =>
        f.id === id ? { ...f, categoryId: newCatId, order: endOrder } : f,
      );
    });
  }

  // Sorted fields per category for rendering.
  const fieldsByCat = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    const sorted = [...fields].sort((a, b) => a.order - b.order);
    for (const f of sorted) {
      const list = map.get(f.categoryId) ?? [];
      list.push(f);
      map.set(f.categoryId, list);
    }
    return map;
  }, [fields]);

  // Build a flat list of fields the admin can reference in showIf rules.
  // Any field in the same entity except the field itself.
  function referenceableFields(currentFieldId: string): FieldDef[] {
    return fields.filter((f) => f.id !== currentFieldId);
  }

  function onSubmit() {
    // Drop incomplete fields (no label) — the save schema requires a label, so
    // an unfinished "+ champ" would otherwise fail the whole save. Also drop
    // fields whose category no longer exists.
    const catIds = new Set(categories.map((c) => c.id));
    const usableFields = fields.filter(
      (f) => (f.label ?? "").trim().length > 0 && catIds.has(f.categoryId),
    );
    // Re-number `order` PER CATEGORY (not across the whole flat array) so
    // each field's position within its category is preserved exactly as the
    // admin arranged it. The previous flat-index approach silently broke
    // per-category ordering whenever fields lived in multiple categories.
    const perCategoryCounter = new Map<string, number>();
    const orderedFields = [...usableFields]
      .sort((a, b) => a.order - b.order)
      .map((f) => {
        const idx = perCategoryCounter.get(f.categoryId) ?? 0;
        perCategoryCounter.set(f.categoryId, idx + 1);
        // Guarantee a non-empty key: a non-Latin label (e.g. Arabic "الاسم")
        // slugifies to "", which would fail the save schema's key.min(1).
        const derived = (f.key || slugifyKey(f.label)).trim();
        return {
          ...f,
          order: idx,
          key: derived || `field_${f.id}`,
          label: f.label.trim(),
        };
      });

    const fd = new FormData();
    const payload = {
      entity,
      categories: categories.map((c, i) => ({
        ...c,
        order: i,
        name: c.name.trim(),
      })),
      fields: orderedFields,
    };
    fd.append("config", JSON.stringify(payload));
    startTransition(async () => {
      const result = await updateEntityFieldsConfig(fd);
      if (result.ok) toast.success(t("fieldsConfig.saved"));
      else toast.error(t("fieldsConfig.saveError"));
    });
  }

  // ── Live WYSIWYG preview ──────────────────────────────────────────
  // Render the exact same FieldsRenderer the parent form uses, off the
  // in-progress config, so editing and the real form stay identical. Clicking
  // a field jumps to its settings row in the editor.
  // Category scoping for the parent-tab layout: when visibleCategoryNames is
  // given, the editor renders only those categories (preview + list + quick-add)
  // while still holding/saving the full config in state.
  const visibleCatSet =
    visibleCategoryNames && visibleCategoryNames.length
      ? new Set(visibleCategoryNames)
      : null;
  const shownCategories = visibleCatSet
    ? categories.filter((c) => visibleCatSet.has(c.name))
    : categories;
  const shownCatIds = new Set(shownCategories.map((c) => c.id));
  const shownFields = visibleCatSet
    ? fields.filter((f) => shownCatIds.has(f.categoryId))
    : fields;
  const previewConfig: EntityFieldsConfig = {
    categories: shownCategories,
    fields: shownFields,
  };
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>(
    {},
  );
  // "form" = WYSIWYG (the editor IS the form, click a field to edit it in a
  // drawer); "list" = the classic per-category list (power view).
  const [mode, setMode] = useState<"form" | "list">("form");
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const activeField = fields.find((f) => f.id === activeFieldId) ?? null;
  const sortedCats = [...categories].sort((a, b) => a.order - b.order);
  const activeCategory =
    categories.find((c) => c.id === activeCategoryId) ?? null;
  const activeCatIdx = activeCategory
    ? sortedCats.findIndex((c) => c.id === activeCategory.id)
    : -1;
  const activeCatFields = activeField
    ? [...fields]
        .filter((f) => f.categoryId === activeField.categoryId)
        .sort((a, b) => a.order - b.order)
    : [];
  const activeIdx = activeField
    ? activeCatFields.findIndex((f) => f.id === activeField.id)
    : -1;

  function handleEditField(id: string) {
    if (mode === "form") {
      setActiveFieldId(id);
      return;
    }
    const f = fields.find((x) => x.id === id);
    if (!f) return;
    setOpenCats((prev) => new Set(prev).add(f.categoryId));
    setTimeout(() => {
      document
        .getElementById(`field-row-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  return (
    <div className="space-y-4">
      {notice}
      {/* Mode toolbar — Formulaire (WYSIWYG) vs Liste, + add category + save. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-0.5 text-xs">
          {(["form", "list"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-3 py-1 font-medium transition-colors duration-150 ease-out",
                mode === m
                  ? "bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground)] shadow-card"
                  : "text-[color:var(--color-foreground-muted)] hover:text-[color:var(--color-foreground)]",
              )}
            >
              {t(m === "form" ? "fieldsConfig.modeForm" : "fieldsConfig.modeList")}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {!visibleCatSet ? (
            <button
              type="button"
              onClick={addCategory}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)]"
            >
              <Plus className="size-4" aria-hidden />
              {t("fieldsConfig.addCategory")}
            </button>
          ) : null}
          <Button type="button" onClick={onSubmit} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pending ? tCommon("loading") : tCommon("save")}
          </Button>
        </div>
      </div>

      {mode === "form" ? (
        /* ── Formulaire (WYSIWYG): the editor IS the live form. ── */
        <div className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-5 shadow-card">
          {shownFields.length === 0 ? (
            <p className="text-sm text-[color:var(--color-foreground-muted)]">
              {t("fieldsConfig.previewEmpty")}
            </p>
          ) : (
            <>
              <p className="mb-4 text-xs text-[color:var(--color-foreground-subtle)]">
                {t("fieldsConfig.clickToEdit")}
              </p>
              <FieldsRenderer
                config={previewConfig}
                answers={previewAnswers}
                extras={{ establishments: [] }}
                unlockBound
                onEditField={handleEditField}
                onEditCategory={setActiveCategoryId}
                onChange={(fid, v) =>
                  setPreviewAnswers((p) => ({ ...p, [fid]: v }))
                }
              />
            </>
          )}
          {/* Quick add a field into any category. */}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-[color:var(--color-border-subtle)] pt-4">
            {shownCategories
              .filter((c) => c.active)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveFieldId(addField(c.id))}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-[color:var(--color-border-strong)] px-2.5 py-1 text-xs font-medium text-[color:var(--color-foreground-muted)] transition-colors hover:border-[color:var(--color-brand-400)] hover:text-[color:var(--color-brand-600)]"
                >
                  <Plus className="size-3.5" aria-hidden />
                  {c.name}
                </button>
              ))}
          </div>
        </div>
      ) : (
      <div className="space-y-4">
      {shownCategories.length === 0 ? (
        <div className="rounded-md border border-dashed border-[color:var(--color-border-strong)] px-4 py-6 text-center text-sm text-[color:var(--color-foreground-muted)]">
          {t("fieldsConfig.noCategories")}
        </div>
      ) : (
        <ul className="space-y-2">
          {shownCategories.map((cat, idx) => {
            const isOpen = openCats.has(cat.id);
            const catFields = fieldsByCat.get(cat.id) ?? [];
            return (
              <li
                key={cat.id}
                className={cn(
                  "overflow-hidden rounded-md border border-[color:var(--color-border-subtle)]",
                  !cat.active && "opacity-60",
                )}
              >
                <header className="flex items-center gap-2 bg-[color:var(--color-surface-raised)] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleCat(cat.id)}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground-muted)]"
                    aria-label={isOpen ? t("fieldsConfig.collapse") : t("fieldsConfig.expand")}
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4" aria-hidden />
                    ) : (
                      <ChevronUp className="size-4 rotate-180" aria-hidden />
                    )}
                  </button>
                  <Input
                    value={cat.name}
                    onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                    className="h-8 flex-1 text-sm font-medium"
                    maxLength={80}
                  />
                  <span className="text-xs text-[color:var(--color-foreground-subtle)]">
                    {catFields.length}
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-foreground-muted)]">
                    <input
                      type="checkbox"
                      checked={cat.active}
                      onChange={(e) => updateCategory(cat.id, { active: e.target.checked })}
                    />
                    {t("fieldsConfig.active")}
                  </label>
                  <button
                    type="button"
                    onClick={() => moveCategory(cat.id, -1)}
                    disabled={idx === 0}
                    aria-label={t("fieldsConfig.moveUp")}
                    className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] enabled:hover:bg-[color:var(--color-surface-sunken)] enabled:hover:text-[color:var(--color-foreground-muted)] disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(cat.id, 1)}
                    disabled={idx === categories.length - 1}
                    aria-label={t("fieldsConfig.moveDown")}
                    className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] enabled:hover:bg-[color:var(--color-surface-sunken)] enabled:hover:text-[color:var(--color-foreground-muted)] disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCategory(cat.id)}
                    aria-label={t("fieldsConfig.removeCategory")}
                    className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-danger-soft)] hover:text-[color:var(--color-danger)]"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </header>

                {isOpen ? (
                  <div className="space-y-2 border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)]/40 p-3">
                    {catFields.length === 0 ? (
                      <p className="text-xs text-[color:var(--color-foreground-muted)]">
                        {t("fieldsConfig.noFields")}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {catFields.map((f, fIdx) => (
                          <FieldRow
                            key={f.id}
                            field={f}
                            entity={entity}
                            parentFieldOptions={parentFieldOptions}
                            isFirst={fIdx === 0}
                            isLast={fIdx === catFields.length - 1}
                            referenceable={referenceableFields(f.id)}
                            categories={categories}
                            onUpdate={(patch) => updateField(f.id, patch)}
                            onRemove={() => removeField(f.id)}
                            onMove={(dir) => moveField(f.id, dir)}
                            onChangeCategory={(catId) => changeFieldCategory(f.id, catId)}
                          />
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => addField(cat.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)]"
                    >
                      <Plus className="size-3.5" aria-hidden />
                      {t("fieldsConfig.addField")}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      </div>
      )}

      {/* Field editor drawer — opens when a field is clicked in Formulaire
          mode. Reuses the same FieldRow controls as the Liste view. */}
      <Sheet
        open={!!activeFieldId}
        onOpenChange={(o) => {
          if (!o) setActiveFieldId(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="text-start">
            <SheetTitle>{t("fieldsConfig.editField")}</SheetTitle>
            <SheetDescription>{t("fieldsConfig.editFieldDesc")}</SheetDescription>
          </SheetHeader>
          {activeField ? (
            <ul className="mt-4">
              <FieldRow
                field={activeField}
                entity={entity}
                parentFieldOptions={parentFieldOptions}
                isFirst={activeIdx === 0}
                isLast={activeIdx === activeCatFields.length - 1}
                referenceable={referenceableFields(activeField.id)}
                categories={categories}
                onUpdate={(patch) => updateField(activeField.id, patch)}
                onRemove={() => {
                  removeField(activeField.id);
                  setActiveFieldId(null);
                }}
                onMove={(dir) => moveField(activeField.id, dir)}
                onChangeCategory={(catId) =>
                  changeFieldCategory(activeField.id, catId)
                }
              />
            </ul>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Section (category) editor drawer — opened from a section heading in
          Formulaire mode. */}
      <Sheet
        open={!!activeCategoryId}
        onOpenChange={(o) => {
          if (!o) setActiveCategoryId(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
          <SheetHeader className="text-start">
            <SheetTitle>{t("fieldsConfig.editSection")}</SheetTitle>
            <SheetDescription>{t("fieldsConfig.editSectionDesc")}</SheetDescription>
          </SheetHeader>
          {activeCategory ? (
            <div className="mt-4 space-y-4">
              <Field
                label={t("fieldsConfig.sectionName")}
                htmlFor={`cat-name-${activeCategory.id}`}
              >
                <Input
                  id={`cat-name-${activeCategory.id}`}
                  value={activeCategory.name}
                  onChange={(e) =>
                    updateCategory(activeCategory.id, { name: e.target.value })
                  }
                  maxLength={80}
                />
              </Field>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={activeCategory.active}
                  onChange={(e) =>
                    updateCategory(activeCategory.id, {
                      active: e.target.checked,
                    })
                  }
                />
                {t("fieldsConfig.active")}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={activeCatIdx <= 0}
                  onClick={() => moveCategory(activeCategory.id, -1)}
                  className="gap-1"
                >
                  <ChevronUp className="size-4" aria-hidden />
                  {t("fieldsConfig.moveUp")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={activeCatIdx === sortedCats.length - 1}
                  onClick={() => moveCategory(activeCategory.id, 1)}
                  className="gap-1"
                >
                  <ChevronDown className="size-4" aria-hidden />
                  {t("fieldsConfig.moveDown")}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(t("fieldsConfig.removeSectionConfirm")))
                    return;
                  removeCategory(activeCategory.id);
                  setActiveCategoryId(null);
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-danger)] transition-colors hover:underline"
              >
                <Trash2 className="size-4" aria-hidden />
                {t("fieldsConfig.removeCategory")}
              </button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FieldRow({
  field,
  entity,
  isFirst,
  isLast,
  referenceable,
  categories,
  parentFieldOptions,
  onUpdate,
  onRemove,
  onMove,
  onChangeCategory,
}: {
  field: FieldDef;
  /** parent vs student — the user-binding picker only appears for parent fields. */
  entity: EntityType;
  /** Parent fields — feeds the student "inherit from father" picker. */
  parentFieldOptions?: { key: string; label: string }[];
  isFirst: boolean;
  isLast: boolean;
  referenceable: FieldDef[];
  categories: FieldCategory[];
  onUpdate: (patch: Partial<FieldDef>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onChangeCategory: (categoryId: string) => void;
}) {
  const t = useTranslations("settings");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const showOptions = field.type === "select";
  const isPreset = PRESET_LOOKUP_TYPES.has(field.type);
  const isDynamic = DYNAMIC_LOOKUP_TYPES.has(field.type);
  const isCrossField = CROSS_FIELD_LOOKUP_TYPES.has(field.type);
  const staticCount =
    isPreset && !isDynamic && !isCrossField
      ? (presetOptionsForType(field.type)?.length ?? 0)
      : 0;
  // For cross-field types, the allowed source field types depend on which
  // compound the field is feeding off.
  //   lebanon_town_for_kaza ← lebanon_region | lebanon_kaza_with_town
  //   niveau_for_establishment ← establishment_ref | establishment_with_niveau
  const sourceCandidates: FieldDef[] =
    field.type === "lebanon_town_for_kaza"
      ? referenceable.filter(
          (rf) =>
            rf.type === "lebanon_region" ||
            rf.type === "lebanon_kaza_with_town",
        )
      : field.type === "niveau_for_establishment"
        ? referenceable.filter(
            (rf) =>
              rf.type === "establishment_ref" ||
              rf.type === "establishment_with_niveau",
          )
        : [];

  return (
    <li
      id={`field-row-${field.id}`}
      className="scroll-mt-4 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-3"
    >
      {field.formHidden ? (
        <div className="mb-2">
          <span className="inline-flex items-center rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
            {t("fieldsConfig.adminOnlyBadge")}
          </span>
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto_auto]">
        <Field label={t("fieldsConfig.label")} htmlFor={`label-${field.id}`}>
          <Input
            id={`label-${field.id}`}
            value={field.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder={t("fieldsConfig.labelPlaceholder")}
            maxLength={200}
          />
        </Field>
        <Field label={t("fieldsConfig.type")} htmlFor={`type-${field.id}`}>
          <Select
            id={`type-${field.id}`}
            value={field.type}
            onChange={(e) => onUpdate({ type: e.target.value as FieldType })}
          >
            {FIELD_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {t(`fieldsConfig.type_${tp}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col items-start gap-1 pb-1">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              // A field that's globally disabled can't be required — that
              // would block submission with no UI to fill the field. UI
              // makes it explicit.
              disabled={field.active === false}
            />
            {t("fieldsConfig.required")}
          </label>
          <label
            className="inline-flex items-center gap-1.5 text-xs"
            title={t("fieldsConfig.activeHint")}
          >
            <input
              type="checkbox"
              checked={field.active !== false}
              onChange={(e) =>
                onUpdate({
                  // Persist explicit false so the value sticks across reloads.
                  active: e.target.checked ? undefined : false,
                  // If we're turning the field off, also clear `required` so
                  // a future re-enable doesn't surprise the parent with a
                  // suddenly-mandatory field.
                  required: e.target.checked ? field.required : false,
                })
              }
            />
            {t("fieldsConfig.fieldActive")}
          </label>
          <label
            className="inline-flex items-center gap-1.5 text-xs"
            title={t("fieldsConfig.formHiddenHint")}
          >
            <input
              type="checkbox"
              checked={field.formHidden === true}
              onChange={(e) =>
                onUpdate({ formHidden: e.target.checked ? true : undefined })
              }
            />
            {t("fieldsConfig.formHidden")}
          </label>
          <label
            className="inline-flex items-center gap-1.5 text-xs"
            title={t("fieldsConfig.renewalHiddenHint")}
          >
            <input
              type="checkbox"
              checked={field.renewalHidden === true}
              onChange={(e) =>
                onUpdate({ renewalHidden: e.target.checked ? true : undefined })
              }
            />
            {t("fieldsConfig.renewalHidden")}
          </label>
          <label
            className="inline-flex items-center gap-1.5 text-xs"
            title={t("fieldsConfig.inscriptionHiddenHint")}
          >
            <input
              type="checkbox"
              checked={field.inscriptionHidden === true}
              onChange={(e) =>
                onUpdate({
                  inscriptionHidden: e.target.checked ? true : undefined,
                })
              }
            />
            {t("fieldsConfig.inscriptionHidden")}
          </label>
          <label
            className="inline-flex items-center gap-1.5 text-xs"
            title={t("fieldsConfig.renewalRequiredHint")}
          >
            <input
              type="checkbox"
              checked={field.renewalRequired === true}
              onChange={(e) =>
                onUpdate({
                  renewalRequired: e.target.checked ? true : undefined,
                })
              }
            />
            {t("fieldsConfig.renewalRequired")}
          </label>
          <label
            className="inline-flex items-center gap-1.5 text-xs"
            title={t("fieldsConfig.renewalPrefillHint")}
          >
            {t("fieldsConfig.renewalPrefill")}
            <Select
              value={field.renewalPrefill ?? "prefill"}
              onChange={(e) =>
                onUpdate({
                  renewalPrefill:
                    e.target.value === "prefill"
                      ? undefined
                      : (e.target.value as "blank" | "locked"),
                })
              }
              className="h-7 w-40 py-0 text-xs"
            >
              <option value="prefill">
                {t("fieldsConfig.renewalPrefillDefault")}
              </option>
              <option value="blank">
                {t("fieldsConfig.renewalPrefillBlank")}
              </option>
              <option value="locked">
                {t("fieldsConfig.renewalPrefillLocked")}
              </option>
            </Select>
          </label>
        </div>
        <div className="flex items-end gap-1 pb-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label={t("fieldsConfig.moveUp")}
            className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] enabled:hover:bg-[color:var(--color-surface-sunken)] enabled:hover:text-[color:var(--color-foreground-muted)] disabled:opacity-30"
          >
            <ChevronUp className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label={t("fieldsConfig.moveDown")}
            className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] enabled:hover:bg-[color:var(--color-surface-sunken)] enabled:hover:text-[color:var(--color-foreground-muted)] disabled:opacity-30"
          >
            <ChevronDown className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("fieldsConfig.removeField")}
            className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] hover:bg-[color:var(--color-danger-soft)] hover:text-[color:var(--color-danger)]"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {showOptions ? (
        <Field
          label={t("fieldsConfig.options")}
          htmlFor={`opts-${field.id}`}
          hint={t("fieldsConfig.optionsHint")}
        >
          <Textarea
            id={`opts-${field.id}`}
            rows={2}
            value={(field.options ?? []).join("\n")}
            onChange={(e) =>
              onUpdate({
                options: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0),
              })
            }
            placeholder="Option 1\nOption 2"
          />
        </Field>
      ) : null}

      {isPreset && !isDynamic && !isCrossField ? (
        <p className="mt-1 text-xs text-[color:var(--color-foreground-muted)]">
          {t("fieldsConfig.presetHint", { count: staticCount })}
        </p>
      ) : null}
      {isDynamic ? (
        <p className="mt-1 text-xs text-[color:var(--color-foreground-muted)]">
          {t("fieldsConfig.dynamicHint")}
        </p>
      ) : null}

      {isCrossField ? (
        <div className="mt-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)]/60 p-3">
          <Field
            label={
              field.type === "niveau_for_establishment"
                ? t("fieldsConfig.niveauSourceField")
                : t("fieldsConfig.townSourceField")
            }
            htmlFor={`xsrc-${field.id}`}
            hint={
              field.type === "niveau_for_establishment"
                ? t("fieldsConfig.niveauSourceHint")
                : t("fieldsConfig.townSourceHint")
            }
          >
            <Select
              id={`xsrc-${field.id}`}
              value={field.optionsSource?.fieldId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onUpdate({
                  optionsSource: v ? { fieldId: v } : undefined,
                });
              }}
            >
              <option value="">{t("fieldsConfig.townSourceNone")}</option>
              {sourceCandidates.map((rf) => (
                <option key={rf.id} value={rf.id}>
                  {rf.label || rf.key || rf.id}
                </option>
              ))}
            </Select>
          </Field>
          {sourceCandidates.length === 0 ? (
            <p className="mt-1 text-xs text-[color:var(--color-warning)]">
              {field.type === "niveau_for_establishment"
                ? t("fieldsConfig.niveauSourceMissing")
                : t("fieldsConfig.townSourceMissing")}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-xs text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)]"
      >
        <Settings2 className="size-3" aria-hidden />
        {showAdvanced ? t("fieldsConfig.hideAdvanced") : t("fieldsConfig.showAdvanced")}
      </button>

      {showAdvanced ? (
        <div className="mt-2 grid gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)]/60 p-3 sm:grid-cols-2">
          <Field
            label={t("fieldsConfig.moveToCategory")}
            htmlFor={`cat-${field.id}`}
            hint={t("fieldsConfig.moveToCategoryHint")}
          >
            <Select
              id={`cat-${field.id}`}
              value={field.categoryId}
              onChange={(e) => onChangeCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("fieldsConfig.key")}
            htmlFor={`key-${field.id}`}
            hint={t("fieldsConfig.keyHint")}
          >
            <Input
              id={`key-${field.id}`}
              value={field.key}
              onChange={(e) => onUpdate({ key: e.target.value })}
              className="font-mono text-xs"
              maxLength={80}
            />
          </Field>
          <Field label={t("fieldsConfig.hint")} htmlFor={`hint-${field.id}`}>
            <Input
              id={`hint-${field.id}`}
              value={field.hint ?? ""}
              onChange={(e) => onUpdate({ hint: e.target.value })}
              placeholder={t("fieldsConfig.hintPlaceholder")}
              maxLength={300}
            />
          </Field>

          <Field
            label={t("fieldsConfig.showIfField")}
            htmlFor={`showif-field-${field.id}`}
            hint={t("fieldsConfig.showIfHint")}
          >
            <Select
              id={`showif-field-${field.id}`}
              value={field.showIf?.fieldId ?? ""}
              onChange={(e) => {
                const fieldId = e.target.value;
                if (!fieldId) onUpdate({ showIf: undefined });
                else
                  onUpdate({
                    showIf: { fieldId, equals: field.showIf?.equals ?? "" },
                  });
              }}
            >
              <option value="">{t("fieldsConfig.showIfNone")}</option>
              {referenceable.map((rf) => (
                <option key={rf.id} value={rf.id}>
                  {rf.label || rf.key || rf.id}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("fieldsConfig.showIfEquals")}
            htmlFor={`showif-eq-${field.id}`}
            hint={
              field.showIf?.anyValue
                ? t("fieldsConfig.showIfAnyHint")
                : t("fieldsConfig.showIfEqualsAnyHint")
            }
          >
            {/* Multi-value OR matching. One value per line. The first save
                migrates a legacy `equals` (single string) into `equalsAny`. */}
            <Textarea
              id={`showif-eq-${field.id}`}
              rows={2}
              disabled={!field.showIf || !!field.showIf.anyValue}
              value={
                field.showIf?.equalsAny
                  ? field.showIf.equalsAny.join("\n")
                  : field.showIf?.equals ?? ""
              }
              onChange={(e) => {
                if (!field.showIf) return;
                const lines = e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0);
                onUpdate({
                  showIf: {
                    fieldId: field.showIf.fieldId,
                    equalsAny: lines.length > 0 ? lines : undefined,
                    anyValue: field.showIf.anyValue,
                    // Drop legacy `equals` — equalsAny supersedes it.
                  },
                });
              }}
              placeholder="6ème\n5ème\n4ème"
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-[color:var(--color-foreground-muted)]">
              <input
                type="checkbox"
                disabled={!field.showIf}
                checked={!!field.showIf?.anyValue}
                onChange={(e) =>
                  onUpdate({
                    showIf: field.showIf
                      ? {
                          ...field.showIf,
                          anyValue: e.target.checked || undefined,
                        }
                      : undefined,
                  })
                }
              />
              {t("fieldsConfig.showIfAnyValue")}
            </label>
          </Field>

          {/* hideIf — symmetric counterpart. When the rule matches, the field
              is hidden even if it would otherwise be shown. Use for mutual
              exclusion (e.g. hide Passport when ID number is filled). */}
          <Field
            label={t("fieldsConfig.hideIfField")}
            htmlFor={`hideif-field-${field.id}`}
            hint={t("fieldsConfig.hideIfHint")}
          >
            <Select
              id={`hideif-field-${field.id}`}
              value={field.hideIf?.fieldId ?? ""}
              onChange={(e) => {
                const fieldId = e.target.value;
                if (!fieldId) onUpdate({ hideIf: undefined });
                else
                  onUpdate({
                    hideIf: { fieldId, equals: field.hideIf?.equals ?? "" },
                  });
              }}
            >
              <option value="">{t("fieldsConfig.hideIfNone")}</option>
              {referenceable.map((rf) => (
                <option key={rf.id} value={rf.id}>
                  {rf.label || rf.key || rf.id}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("fieldsConfig.hideIfEquals")}
            htmlFor={`hideif-eq-${field.id}`}
            hint={
              field.hideIf?.anyValue
                ? t("fieldsConfig.hideIfAnyHint")
                : t("fieldsConfig.showIfEqualsAnyHint")
            }
          >
            <Textarea
              id={`hideif-eq-${field.id}`}
              rows={2}
              disabled={!field.hideIf || !!field.hideIf.anyValue}
              value={
                field.hideIf?.equalsAny
                  ? field.hideIf.equalsAny.join("\n")
                  : field.hideIf?.equals ?? ""
              }
              onChange={(e) => {
                if (!field.hideIf) return;
                const lines = e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0);
                onUpdate({
                  hideIf: {
                    fieldId: field.hideIf.fieldId,
                    equalsAny: lines.length > 0 ? lines : undefined,
                    anyValue: field.hideIf.anyValue,
                  },
                });
              }}
              placeholder="…"
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-[color:var(--color-foreground-muted)]">
              <input
                type="checkbox"
                disabled={!field.hideIf}
                checked={!!field.hideIf?.anyValue}
                onChange={(e) =>
                  onUpdate({
                    hideIf: field.hideIf
                      ? {
                          ...field.hideIf,
                          anyValue: e.target.checked || undefined,
                        }
                      : undefined,
                  })
                }
              />
              {t("fieldsConfig.hideIfAnyValue")}
            </label>
          </Field>

          {/* Student-only: mirror a value from the dossier identity. The
              field becomes read-only — edits flow through the Identité du
              dossier section so the canonical value isn't duplicated. */}
          {entity === "student" ? (
            <div className="sm:col-span-2">
              <Field
                label={t("fieldsConfig.dossierBoundLabel")}
                htmlFor={`dossier-${field.id}`}
                hint={t("fieldsConfig.dossierBoundHint")}
              >
                <Select
                  id={`dossier-${field.id}`}
                  value={field.dossierBoundTo ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onUpdate({
                      dossierBoundTo: v ? (v as DossierBoundProp) : undefined,
                    });
                  }}
                >
                  <option value="">
                    {t("fieldsConfig.dossierBoundNone")}
                  </option>
                  {DOSSIER_BOUND_PROPS.map((p) => (
                    <option key={p} value={p}>
                      {t(`fieldsConfig.dossierBound_${p}` as never)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          {/* Parent-only: link the field to a known User property so the
              parent doesn't re-type their own info on every dossier. */}
          {entity === "parent" ? (
            <div className="sm:col-span-2">
              <Field
                label={t("fieldsConfig.userBoundLabel")}
                htmlFor={`bound-${field.id}`}
                hint={t("fieldsConfig.userBoundHint")}
              >
                <Select
                  id={`bound-${field.id}`}
                  value={field.userBoundTo ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onUpdate({
                      userBoundTo: v ? (v as UserBoundProp) : undefined,
                    });
                  }}
                >
                  <option value="">
                    {t("fieldsConfig.userBoundNone")}
                  </option>
                  {USER_BOUND_PROPS.map((p) => (
                    <option key={p} value={p}>
                      {t(`fieldsConfig.userBound_${p}` as never)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          {/* Student-only: inherit this field's value from the father's answer
              for a parent field (on acceptance). Generic version of "child
              inherits the father's communauté / registre". */}
          {entity === "student" &&
          parentFieldOptions &&
          parentFieldOptions.length > 0 ? (
            <div className="sm:col-span-2">
              <Field
                label={t("fieldsConfig.inheritParentLabel")}
                htmlFor={`inherit-${field.id}`}
                hint={t("fieldsConfig.inheritParentHint")}
              >
                <Select
                  id={`inherit-${field.id}`}
                  value={field.inheritParentKey ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onUpdate({ inheritParentKey: v || undefined });
                  }}
                >
                  <option value="">
                    {t("fieldsConfig.inheritParentNone")}
                  </option>
                  {parentFieldOptions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label || p.key}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
