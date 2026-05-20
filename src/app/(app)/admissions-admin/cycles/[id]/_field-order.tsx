"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardStep } from "@/lib/admission-fields";
import { cn } from "@/lib/utils";
import { updateCycleFieldOrder } from "../../_actions";

type FieldRow = {
  key: string;
  labelKey: string;
};

type StepBlock = {
  step: WizardStep;
  fields: FieldRow[];
  defaultOrder: string[];
};

export function FieldOrderForm({
  cycleId,
  steps,
  initialOrder,
}: {
  cycleId: string;
  steps: StepBlock[];
  initialOrder: Partial<Record<WizardStep, string[]>>;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();

  // Per-step current order. If no override is set, use the registry order.
  const [order, setOrder] = useState<Record<WizardStep, string[]>>(() => {
    const out = {} as Record<WizardStep, string[]>;
    for (const s of steps) {
      const override = initialOrder[s.step];
      out[s.step] = override && override.length > 0 ? override : s.defaultOrder;
    }
    return out;
  });

  function resetStep(step: WizardStep) {
    const block = steps.find((s) => s.step === step);
    if (!block) return;
    setOrder((prev) => ({ ...prev, [step]: block.defaultOrder }));
  }

  function onSubmit() {
    startTransition(async () => {
      try {
        const result = await updateCycleFieldOrder(cycleId, order);
        if (result.error) toast.error(t("fieldOrderErrorToast"));
        else toast.success(t("fieldOrderSuccessToast"));
      } catch {
        toast.error(t("fieldOrderErrorToast"));
      }
    });
  }

  return (
    <div className="space-y-6">
      {steps.map((s) => {
        const labelByKey = new Map(s.fields.map((f) => [f.key, f.labelKey]));
        const items = order[s.step].filter((k) => labelByKey.has(k));
        return (
          <div key={s.step} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                {t(`fieldStep_${s.step}`)}
              </p>
              <button
                type="button"
                onClick={() => resetStep(s.step)}
                className="inline-flex items-center gap-1 text-xs text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)]"
              >
                <RotateCcw className="size-3" aria-hidden />
                {t("fieldOrderReset")}
              </button>
            </div>
            <SortableList
              items={items}
              onChange={(next) =>
                setOrder((prev) => ({ ...prev, [s.step]: next }))
              }
              renderItem={(key) => (
                <span className="text-sm text-[color:var(--color-foreground)]">
                  {t(labelByKey.get(key)!)}
                </span>
              )}
            />
          </div>
        );
      })}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="gap-2"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </div>
  );
}

function SortableList({
  items,
  onChange,
  renderItem,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  renderItem: (id: string) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul className="overflow-hidden rounded-md border border-[color:var(--color-border-subtle)]">
          {items.map((id, i) => (
            <SortableItem
              key={id}
              id={id}
              isFirst={i === 0}
              render={() => renderItem(id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  isFirst,
  render,
}: {
  id: string;
  isFirst: boolean;
  render: () => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 bg-[color:var(--color-surface-raised)] px-3 py-2.5",
        !isFirst && "border-t border-[color:var(--color-border-subtle)]",
        isDragging && "z-10 shadow-card",
      )}
    >
      <button
        type="button"
        aria-label="Reorder"
        className="inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground-muted)] active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="flex-1 min-w-0">{render()}</div>
    </li>
  );
}
