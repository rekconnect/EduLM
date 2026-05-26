# WYSIWYG Inscription Form Editor — Implementation Handoff

You are picking up work on EduLM, a multi-tenant school-management platform
(Next.js 16 + React 19 + TS + Tailwind 4 + shadcn/ui + Prisma 6). The parent
inscription dossier has 10 tabs and is described in detail in
`dossier-build-log.md` at the project root — **read that file first** if you
haven't already.

This document describes one specific piece of work: building a v1 WYSIWYG
editor that lets school admins customise hardcoded form fields per tenant.

---

## What we're building

A WYSIWYG editor at `/admin/inscription-config/preview` that lets a school
admin click any field in the parent inscription dossier and override:

- **Label** (per locale: FR / EN / AR)
- **Required** (true / false)
- **Hidden** (true / false — hidden implies not-required)

The editor renders the actual parent dossier components in edit mode, with
pencil affordances on every registered field. Clicking a pencil opens a
right-side drawer with the three controls above.

Overrides are stored per-tenant. Live edits — no draft/publish workflow.
Per-field "Reset to default" reverts cleanly.

## Explicitly NOT in v1

Do not build any of these, even if they feel like quick wins:

- Drag-to-reorder fields or sections
- Editing option lists (selects, radios, etc.)
- Show-if / hide-if conditional rules
- Draft → publish workflow
- Copy-config-from-tenant
- Bulk edit / templates
- Audit log with diff view (v1 has a simple append-only log only)

Each of these is intentionally deferred. If you find yourself building one,
stop and ask.

---

## Architectural decisions (already locked in — do not relitigate)

1. **Field registry pattern.** Every hardcoded field gets a stable key
   (`{tab}.{section}.{field}`) in a central registry. The registry holds
   default label / type / required. Tenant overrides live in a separate
   sparse JSON config and merge on top.

2. **Resolver hook.** Every dossier component reads field metadata via a
   resolver instead of hardcoding labels and required flags. Server-side:
   `resolveField(key, tenantConfig, locale)`. Client-side: `useField(key)`.

3. **Sparse overrides.** `Tenant.inscriptionFormConfig` only contains
   diverging keys. Reset = delete the key from the JSON. Empty/default
   values must never be written.

4. **Preview renders against React state, not a DB row.** Dossier tab
   components accept an `editMode` boolean prop. When true, save handlers
   are no-ops and state lives in local React state seeded with realistic
   mock data. No scratch Application row in the database.

5. **Preview is an admin route, not the parent route.** Build the editor at
   `/admin/inscription-config/preview`. Do not add admin-only branches to
   `/parent/inscriptions/[id]/edit`.

6. **Existing `/settings` → Forms editor stays as-is.** It handles *custom*
   fields. This new editor handles *hardcoded* fields. Two separate UIs, two
   separate mental models. Do not try to merge them.

---

## Work plan — 5 phases with checkpoints

Work through these in order. **Stop and report at the end of each phase
before continuing.** Each phase is meant to be reviewable on its own.

### Phase 1 — Registry + schema + resolver

**Goal:** the foundation exists, but nothing in the UI uses it yet.

1. Create `src/lib/inscription-fields-registry.ts`. Walk through every
   `_tab-*.tsx` and `_section-*.tsx` file under
   `src/app/(app)/parent/inscriptions/[id]/edit/` and enumerate every
   hardcoded field. For each field, write a registry entry:

   ```ts
   "eleve.etatCivil.nomFR": {
     tab: "eleve",
     section: "etatCivil",
     type: "text",  // text | textarea | boolean | select | date | phone
     defaultLabel: { fr: "...", en: "...", ar: "..." },
     defaultRequired: true,
   }
   ```

   Pull the FR labels directly from the components. Pull EN/AR from the
   existing next-intl message files. Key shape is `{tab}.{section}.{field}`
   — keep it consistent.

   Expect ~80-120 entries. Group them in the file by tab in registration
   order so it's readable.

2. Add `inscriptionFormConfig Json?` to the `Tenant` model in
   `prisma/schema.prisma`. Shape:

   ```ts
   {
     version: 1,
     fields: {
       [key: string]: {
         label?: { fr?: string; en?: string; ar?: string };
         required?: boolean;
         hidden?: boolean;
       }
     }
   }
   ```

   Run `npx prisma db push` and `npx prisma generate`. **Remind the
   operator to stop the dev server before running these — Windows DLL lock
   on the Prisma engine.**

3. Create `src/lib/inscription-fields-resolver.ts`:

   - `resolveField(key, tenantConfig, locale)` → `{ label, required, hidden }`.
   - Hidden true implies required false in the returned object (defensive).
   - Unknown key → log a warning and return the registry default if it
     exists, or throw in dev / return sensible defaults in prod.
   - Memoise the merged config per tenant in a request-scoped cache.

4. Create a matching client hook `useField(key)` that reads tenant config
   from a React context provided high in the dossier tree.

5. **Do NOT thread the resolver into any component yet.** That happens in
   Phase 2. End Phase 1 with the registry, schema migration, and resolver
   in place but unused.

**Checkpoint:** show me the registry file structure (first 10-15 entries +
total count), the schema diff, and the resolver signature. Wait for review.

### Phase 2 — Vertical slice: thread the Élève tab only

**Goal:** prove the resolver API is pleasant before replicating it 9 more
times.

1. Wrap the dossier shell in a `TenantConfigProvider` that fetches
   `Tenant.inscriptionFormConfig` once and exposes it via context.

2. Convert every hardcoded label and required check in
   `_section-eleve-etat-civil.tsx` and `_section-eleve-passport.tsx` to
   read through `useField(key)`.

3. Update the Élève completion checker in `src/lib/dossier-tabs.ts` (or
   wherever `isEleveComplete()` lives) to honor overrides:
   - Hidden field is never required.
   - Admin-marked-optional field doesn't block completion.

4. Sanity-test as a real parent at `/parent/inscriptions/{id}/edit?tab=eleve`
   with no overrides set — the form must look and behave identically to
   before this change. Zero regression.

**Checkpoint:** show me the diff for the Élève section files. If the
resolver API feels awkward to use, fix it now before Phase 4 replicates the
pattern across 9 more tabs. Wait for review.

### Phase 3 — Editor UI against Élève

**Goal:** working WYSIWYG editor for the Élève tab.

1. Add `editMode?: boolean` prop to the Élève tab components. When true,
   save handlers become no-ops and state is seeded with realistic mock data
   (not a real Application row).

2. Build `/admin/inscription-config/preview` route. It renders
   `<EleveTab editMode />`. On hover, every field registered in the
   registry shows a pencil affordance positioned consistently (top-right of
   the field's container).

3. Build a right-side drawer (~400px wide, sheet pattern from shadcn/ui,
   EduLM motion language — smooth enter/exit, ESC to close, click-outside
   with dirty-state confirm). Contents:

   - Header: registry key + the field's tab/section breadcrumb.
   - Locale tabs (FR / EN / AR) with a label text input per locale.
     Placeholder shows the default label so admins know what they're
     overriding.
   - Required toggle.
   - Hidden toggle. When on, Required toggle is visually disabled.
   - "Réinitialiser ce champ" button — only enabled when this field has
     any override currently saved. Clears the key from
     `inscriptionFormConfig.fields`.
   - Save button — writes to `Tenant.inscriptionFormConfig`, sonner toast
     on success, drawer closes, the underlying field re-renders with the
     new config.

4. Server action: `saveFieldOverride(tenantId, fieldKey, override)` that
   merges sparsely — empty/default values are stripped before write.
   Companion action: `resetFieldOverride(tenantId, fieldKey)`.

5. **Validate the full loop** before continuing:
   - Edit a label in the editor → save → load
     `/parent/inscriptions/{id}/edit?tab=eleve` as a real parent → confirm
     the label changed.
   - Flip a previously-required field to optional → confirm the À REMPLIR
     badge and `isEleveComplete()` update.
   - Hide a field → confirm it disappears from the parent view AND doesn't
     block completion.
   - Reset the field → confirm it reverts to registry default.

**Checkpoint:** show me a screenshot of the editor in action (or a careful
description if you can't). Confirm all four validation steps pass. Wait for
review.

### Phase 4 — Thread remaining 9 tabs

**Goal:** the WYSIWYG editor works against every tab.

For each of the remaining tabs, in this order:
Responsables → Foyer → Scolarité → Pédagogique → Transport → Contacts →
Santé → Finance → Validation.

For each tab:
1. Add `editMode` prop to the tab component and any sub-components.
2. Convert every hardcoded label/required check to `useField()`.
3. Update the per-tab completion checker to honor overrides.
4. Add the tab to the preview route navigation so it can be edited.
5. Run the same 4-step validation from Phase 3 on at least one field per
   tab.

This is mechanical work. ~30-60 min per tab. If any tab takes substantially
longer, stop and report — there's probably a structural mismatch worth
discussing before pushing through.

**Checkpoint:** after every 3 tabs (so 3 checkpoints total), report
progress with a short summary. Don't wait for a response between
checkpoints unless something is genuinely blocking.

### Phase 5 — Polish + ship

1. **Audit log.** Create `TenantConfigAuditLog` table:
   `id, tenantId, userId, fieldKey, action (set | reset), previousValue
   Json?, newValue Json?, createdAt`. Append on every successful
   `saveFieldOverride` / `resetFieldOverride`. No UI for it yet — just the
   data.

2. **First-time empty state** on the preview route — overlay or banner
   that says "Survolez n'importe quel champ pour le personnaliser."
   Auto-dismisses after first edit.

3. **Save UX:**
   - Sonner toast on save.
   - ESC closes the drawer.
   - Click-outside with unsaved changes prompts confirm.
   - Loading state on the Save button.

4. **Update `/admin/inscription-config` landing page** to link to
   `/admin/inscription-config/preview` and remove the "WYSIWYG roadmap"
   card now that it ships.

**Checkpoint:** final report with a summary of files changed, anything
worth flagging for v2, and the list of all v2 features explicitly deferred
(reorder, options, show-if, draft/publish, copy-from-tenant, bulk edit,
audit-log UI).

---

## Operating notes

- **i18n is FR/EN/AR with RTL on Arabic.** Use next-intl 4. Don't hardcode
  French strings outside the registry.
- **Theming is light/dark via next-themes.** All new UI must work in both.
- **Motion language:** sheet from the right, EduLM hover/focus polish, no
  abrupt mounts. Use `motion/react`.
- **Stop the dev server before any `prisma db push` / `prisma generate`**
  on Windows (DLL lock on the Prisma engine).
- **Multi-tenant safety:** every read and write must scope by tenantId.
  Use the existing tenant-resolution pattern from
  `/admin/inscription-config/_actions.ts`.
- When in doubt about scope, refuse to expand it. Ask instead.

---

## Files you will create or modify

Probably touched:
- `prisma/schema.prisma` (add `inscriptionFormConfig`, `TenantConfigAuditLog`)
- `src/lib/inscription-fields-registry.ts` (new)
- `src/lib/inscription-fields-resolver.ts` (new)
- `src/lib/dossier-tabs.ts` (completion checkers honor overrides)
- All 10 `_tab-*.tsx` + every `_section-*.tsx` under
  `parent/inscriptions/[id]/edit/`
- `src/app/(app)/admin/inscription-config/page.tsx` (link to new preview)
- `src/app/(app)/admin/inscription-config/preview/page.tsx` (new)
- `src/app/(app)/admin/inscription-config/_actions.ts`
  (`saveFieldOverride`, `resetFieldOverride`)
- New drawer component, probably under
  `src/components/dossier/field-edit-drawer.tsx`

---

## Start with Phase 1. Stop at the checkpoint.
