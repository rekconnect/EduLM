"use client";

/**
 * Context + helper component for the WYSIWYG inscription editor's
 * "preview" mode. When mounted inside <PreviewEditModeProvider>, every
 * <EditableField> wraps its children in a hover-pencil affordance that
 * opens the right-side field-edit drawer.
 *
 * Outside the provider, <EditableField> is a no-op — it just renders
 * its children. That means the same Élève section components are
 * used live AND in preview without branching on a prop. The provider
 * presence is the switch.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";

type PreviewEditModeCtx = {
  inEditMode: boolean;
  activeFieldKey: string | null;
  setActiveFieldKey: (key: string | null) => void;
};

const Ctx = createContext<PreviewEditModeCtx>({
  inEditMode: false,
  activeFieldKey: null,
  setActiveFieldKey: () => {},
});

export function PreviewEditModeProvider({ children }: { children: ReactNode }) {
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const value = useMemo<PreviewEditModeCtx>(
    () => ({ inEditMode: true, activeFieldKey, setActiveFieldKey }),
    [activeFieldKey],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreviewEditMode(): PreviewEditModeCtx {
  return useContext(Ctx);
}

/**
 * Wrap any Field-rendering JSX in this. When the surrounding tree is
 * not in preview edit mode, it renders the children verbatim. Inside
 * preview, it adds a relative container + a hover-revealed pencil
 * button top-right that opens the editor drawer for `fieldKey`.
 *
 * The pencil button is intentionally subtle until hover so it doesn't
 * clutter the visual rhythm of the form. Tab-key focus also reveals
 * it for keyboard users.
 */
export function EditableField({
  fieldKey,
  children,
}: {
  fieldKey: string;
  children: ReactNode;
}) {
  const { inEditMode, activeFieldKey, setActiveFieldKey } = usePreviewEditMode();
  if (!inEditMode) return <>{children}</>;
  const isActive = activeFieldKey === fieldKey;
  return (
    <div
      className={
        "group relative rounded-md outline-2 -outline-offset-2 transition-[outline-color] duration-150 ease-out " +
        (isActive
          ? "outline-[color:var(--color-brand-500)]"
          : "outline-transparent hover:outline-[color:var(--color-border-strong)]")
      }
    >
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setActiveFieldKey(fieldKey);
        }}
        title={`Modifier · ${fieldKey}`}
        className="absolute end-1 top-1 inline-flex size-7 items-center justify-center rounded-md bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground-muted)] opacity-0 shadow-card outline-2 -outline-offset-1 outline-[color:var(--color-border-subtle)] transition-opacity duration-150 ease-out group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-[color:var(--color-brand-500)] hover:text-[color:var(--color-brand-600)]"
      >
        <Pencil className="size-3.5" aria-hidden />
        <span className="sr-only">Modifier ce champ</span>
      </button>
    </div>
  );
}
