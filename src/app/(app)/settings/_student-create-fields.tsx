"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FIELD_TYPES, slugifyKey, type FieldDef } from "@/lib/entity-fields";
import {
  type BuiltinFieldMode,
  type StudentAllCreateKey,
  type StudentCreateConfig,
  STUDENT_ALL_CREATE_KEYS,
  isStudentRequiredKey,
  studentCreateDefaultLabel,
} from "@/lib/student-create-config";
import { updateStudentCreateConfig } from "./_actions";
import { BuiltinFieldsList } from "./_builtin-fields-list";

function newId(): string {
  return Math.random().toString(36).slice(2, 12);
}

const ALLOWED_CREATE_TYPES = [
  "short_text",
  "long_text",
  "select",
  "yes_no",
  "date",
  "number",
  "phone",
  "email",
] as const satisfies ReadonlyArray<(typeof FIELD_TYPES)[number]>;

/**
 * Settings UI for the /students/new admin form — same shape as the parent
 * create editor (built-in field modes + small custom-field list). Reuses the
 * generic parentCreate.* strings; only the field labels are student-specific.
 */
export function StudentCreateFieldsForm({
  initial,
}: {
  initial: StudentCreateConfig;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tStudents = useTranslations("students");
  const tAdmissions = useTranslations("admissions");
  const [pending, startTransition] = useTransition();

  const [builtin, setBuiltin] = useState(initial.builtin);
  const [builtinMeta, setBuiltinMeta] = useState(initial.builtinMeta ?? {});
  const [categoryId] = useState<string>(
    () => initial.categories[0]?.id ?? newId(),
  );
  const [fields, setFields] = useState<FieldDef[]>(initial.fields);

  // Required identity fields are always "required"; the rest read their mode.
  const modeOf = (key: StudentAllCreateKey): BuiltinFieldMode =>
    isStudentRequiredKey(key)
      ? "required"
      : builtin[key as Exclude<StudentAllCreateKey, "firstName" | "lastName" | "status">];

  function setBuiltinMode(key: StudentAllCreateKey, mode: BuiltinFieldMode) {
    if (isStudentRequiredKey(key)) return; // locked
    setBuiltin((prev) => ({ ...prev, [key]: mode }) as typeof prev);
  }

  function setBuiltinLabel(key: StudentAllCreateKey, label: string) {
    setBuiltinMeta((prev) => ({
      ...prev,
      [key]: { ...prev[key], label: label.trim() ? label : undefined },
    }));
  }

  function moveBuiltin(key: StudentAllCreateKey, dir: -1 | 1) {
    setBuiltinMeta((prev) => {
      const ordered = [...STUDENT_ALL_CREATE_KEYS].sort(
        (a, b) =>
          (prev[a]?.order ?? STUDENT_ALL_CREATE_KEYS.indexOf(a)) -
          (prev[b]?.order ?? STUDENT_ALL_CREATE_KEYS.indexOf(b)),
      );
      const idx = ordered.indexOf(key);
      const swap = idx + dir;
      if (swap < 0 || swap >= ordered.length) return prev;
      [ordered[idx], ordered[swap]] = [ordered[swap]!, ordered[idx]!];
      const next = { ...prev };
      ordered.forEach((kk, i) => {
        next[kk] = { ...next[kk], order: i };
      });
      return next;
    });
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      {
        id: newId(),
        key: `custom_${prev.length + 1}`,
        label: "",
        type: "short_text",
        required: false,
        active: true,
        categoryId,
        order: prev.length,
      },
    ]);
  }

  function updateField(id: string, patch: Partial<FieldDef>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function moveField(id: string, dir: -1 | 1) {
    setFields((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const swap = idx + dir;
      if (swap < 0 || swap >= sorted.length) return prev;
      const a = sorted[idx]!;
      const b = sorted[swap]!;
      sorted[idx] = b;
      sorted[swap] = a;
      return sorted.map((f, i) => ({ ...f, order: i }));
    });
  }

  function onSubmit() {
    const finalized = fields.map((f, i) => ({
      ...f,
      order: i,
      key: f.key?.trim() ? f.key : slugifyKey(f.label) || `field_${i + 1}`,
      categoryId,
    }));
    const config = {
      builtin,
      builtinMeta,
      categories: [
        {
          id: categoryId,
          name: t("parentCreate.customCategory"),
          order: 0,
          active: true,
        },
      ],
      fields: finalized,
    };
    const fd = new FormData();
    fd.set("config", JSON.stringify(config));
    startTransition(async () => {
      const r = await updateStudentCreateConfig(fd);
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("parentCreate.saveError"));
    });
  }

  const sorted = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      {/* ── Built-in field toggles ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
          {t("parentCreate.builtinSectionTitle")}
        </p>
        <p className="text-sm text-[color:var(--color-foreground-muted)]">
          {t("studentCreate.builtinSectionHint")}
        </p>

        <BuiltinFieldsList
          keys={STUDENT_ALL_CREATE_KEYS}
          modeOf={modeOf}
          isLocked={isStudentRequiredKey}
          meta={builtinMeta}
          defaultLabel={(k) =>
            studentCreateDefaultLabel(
              k,
              (s) => tStudents(s as never),
              (s) => tAdmissions(s as never),
            )
          }
          modeLabels={{
            required: t("parentCreate.mode.required"),
            optional: t("parentCreate.mode.optional"),
            hidden: t("parentCreate.mode.hidden"),
          }}
          upLabel={t("parentCreate.moveUp")}
          downLabel={t("parentCreate.moveDown")}
          onMode={setBuiltinMode}
          onLabel={setBuiltinLabel}
          onMove={moveBuiltin}
        />
        <p className="text-xs text-[color:var(--color-foreground-subtle)]">
          {t("studentCreate.identityAlwaysRequired")}
        </p>
      </div>

      {/* ── Custom additional fields ── */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
              {t("parentCreate.customSectionTitle")}
            </p>
            <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
              {t("parentCreate.customSectionHint")}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addField}
            className="gap-1.5"
          >
            <Plus className="size-4" aria-hidden />
            {t("parentCreate.addField")}
          </Button>
        </div>

        {sorted.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-6 text-center text-sm text-[color:var(--color-foreground-muted)]">
            {t("parentCreate.customEmpty")}
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((f, i) => (
              <div
                key={f.id}
                className="space-y-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-0.5 pt-1">
                    <button
                      type="button"
                      onClick={() => moveField(f.id, -1)}
                      disabled={i === 0}
                      aria-label={t("parentCreate.moveUp")}
                      className="inline-flex size-5 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)] disabled:opacity-30"
                    >
                      <ChevronUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(f.id, 1)}
                      disabled={i === sorted.length - 1}
                      aria-label={t("parentCreate.moveDown")}
                      className="inline-flex size-5 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)] disabled:opacity-30"
                    >
                      <ChevronDown className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                    <Field label={t("parentCreate.fieldLabel")} htmlFor={`f-${f.id}-label`}>
                      <Input
                        id={`f-${f.id}-label`}
                        value={f.label}
                        onChange={(e) => updateField(f.id, { label: e.target.value })}
                        placeholder={t("parentCreate.fieldLabelPlaceholder")}
                      />
                    </Field>
                    <Field label={t("parentCreate.fieldType")} htmlFor={`f-${f.id}-type`}>
                      <Select
                        id={`f-${f.id}-type`}
                        value={f.type}
                        onChange={(e) =>
                          updateField(f.id, { type: e.target.value as FieldDef["type"] })
                        }
                      >
                        {ALLOWED_CREATE_TYPES.map((tp) => (
                          <option key={tp} value={tp}>
                            {t(`parentCreate.type.${tp}`)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-[color:var(--color-foreground-muted)]">
                        {t("parentCreate.fieldRequired")}
                      </label>
                      <label className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-3 text-sm">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) =>
                            updateField(f.id, { required: e.target.checked })
                          }
                          className="size-4 rounded border-[color:var(--color-border-strong)] text-[color:var(--color-brand-600)]"
                        />
                        <span className="text-[color:var(--color-foreground-muted)]">
                          {f.required
                            ? t("parentCreate.requiredYes")
                            : t("parentCreate.requiredNo")}
                        </span>
                      </label>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeField(f.id)}
                        aria-label={t("parentCreate.removeField")}
                        className="inline-flex size-9 items-center justify-center rounded-md text-[color:var(--color-danger)] transition-colors hover:bg-[color:var(--color-danger)]/10"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>

                {f.type === "select" ? (
                  <Field
                    label={t("parentCreate.fieldOptions")}
                    htmlFor={`f-${f.id}-options`}
                    hint={t("parentCreate.fieldOptionsHint")}
                  >
                    <Textarea
                      id={`f-${f.id}-options`}
                      rows={3}
                      value={(f.options ?? []).join("\n")}
                      onChange={(e) =>
                        updateField(f.id, {
                          options: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onSubmit} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
              {tCommon("saving")}
            </>
          ) : (
            tCommon("save")
          )}
        </Button>
      </div>
    </div>
  );
}
