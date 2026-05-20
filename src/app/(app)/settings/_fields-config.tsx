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
import { cn } from "@/lib/utils";
import {
  CROSS_FIELD_LOOKUP_TYPES,
  DEFAULT_PARENT_CATEGORIES,
  DEFAULT_STUDENT_CATEGORIES,
  DYNAMIC_LOOKUP_TYPES,
  FIELD_TYPES,
  PRESET_LOOKUP_TYPES,
  USER_BOUND_PROPS,
  slugifyKey,
  type EntityFieldsConfig,
  type EntityType,
  type FieldCategory,
  type FieldDef,
  type FieldType,
  type UserBoundProp,
} from "@/lib/entity-fields";
import { presetOptionsForType } from "@/lib/lookups";
import { updateEntityFieldsConfig } from "./_actions";

type Props = {
  entity: EntityType;
  initial: EntityFieldsConfig;
};

/** Tiny stable id generator — sufficient for client-side ids. */
function newId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function FieldsConfigForm({ entity, initial }: Props) {
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
  function addField(categoryId: string) {
    setFields((prev) => [
      ...prev,
      {
        id: newId(),
        key: "",
        label: "",
        type: "short_text",
        required: false,
        categoryId,
        order: prev.filter((f) => f.categoryId === categoryId).length,
      },
    ]);
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
    const fd = new FormData();
    const payload = {
      entity,
      categories: categories.map((c, i) => ({ ...c, order: i, name: c.name.trim() })),
      fields: fields.map((f, i) => ({
        ...f,
        order: i,
        key: (f.key || slugifyKey(f.label)).trim(),
        label: f.label.trim(),
      })),
    };
    fd.append("config", JSON.stringify(payload));
    startTransition(async () => {
      const result = await updateEntityFieldsConfig(fd);
      if (result.ok) toast.success(t("fieldsConfig.saved"));
      else toast.error(t("fieldsConfig.saveError"));
    });
  }

  return (
    <div className="space-y-4">
      {categories.length === 0 ? (
        <div className="rounded-md border border-dashed border-[color:var(--color-border-strong)] px-4 py-6 text-center text-sm text-[color:var(--color-foreground-muted)]">
          {t("fieldsConfig.noCategories")}
        </div>
      ) : (
        <ul className="space-y-2">
          {categories.map((cat, idx) => {
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
                            isFirst={fIdx === 0}
                            isLast={fIdx === catFields.length - 1}
                            referenceable={referenceableFields(f.id)}
                            onUpdate={(patch) => updateField(f.id, patch)}
                            onRemove={() => removeField(f.id)}
                            onMove={(dir) => moveField(f.id, dir)}
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

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addCategory}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)]"
        >
          <Plus className="size-4" aria-hidden />
          {t("fieldsConfig.addCategory")}
        </button>
        <Button type="button" onClick={onSubmit} disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  entity,
  isFirst,
  isLast,
  referenceable,
  onUpdate,
  onRemove,
  onMove,
}: {
  field: FieldDef;
  /** parent vs student — the user-binding picker only appears for parent fields. */
  entity: EntityType;
  isFirst: boolean;
  isLast: boolean;
  referenceable: FieldDef[];
  onUpdate: (patch: Partial<FieldDef>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
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
  // For lebanon_town_for_kaza, the source field must be either a plain
  // `lebanon_region` field OR a `lebanon_kaza_with_town` compound (we'll
  // extract just the caza half from the compound value at render time).
  const sourceCandidates =
    field.type === "lebanon_town_for_kaza"
      ? referenceable.filter(
          (rf) =>
            rf.type === "lebanon_region" ||
            rf.type === "lebanon_kaza_with_town",
        )
      : [];

  return (
    <li className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-3">
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
        <div className="flex items-end pb-1">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
            />
            {t("fieldsConfig.required")}
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

      {field.type === "lebanon_town_for_kaza" ? (
        <div className="mt-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)]/60 p-3">
          <Field
            label={t("fieldsConfig.townSourceField")}
            htmlFor={`townsrc-${field.id}`}
            hint={t("fieldsConfig.townSourceHint")}
          >
            <Select
              id={`townsrc-${field.id}`}
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
              {t("fieldsConfig.townSourceMissing")}
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
          >
            <Input
              id={`showif-eq-${field.id}`}
              disabled={!field.showIf}
              value={field.showIf?.equals ?? ""}
              onChange={(e) =>
                onUpdate({
                  showIf: field.showIf
                    ? { ...field.showIf, equals: e.target.value }
                    : undefined,
                })
              }
              placeholder="6ème"
              maxLength={200}
            />
          </Field>

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
        </div>
      ) : null}
    </li>
  );
}
