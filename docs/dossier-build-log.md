# EduLM — Inscription Dossier Build Log

A condensed engineering log of the work done in one long working session
to rebuild the parent inscription flow on EduLM around the Eduka model
(10-tab dossier) using Lycée Montaigne's actual form fields.

The log is written so a teammate (or future-you) can pick up the work
without having to read the entire chat.

---

## 1. The original ask

- Build a parent-facing dossier that **looks like Eduka** (10 tabs, À
  REMPLIR badges, sticky bottom bar, polished card+modal pattern) but
  captures the **fields Lycée Montaigne actually asks for** on their
  paper inscription form.
- Multi-tenant from day one — Lycée Montaigne is the anchor, other MLF
  schools should be able to flip features on/off per tenant.
- Admin must be able to customise which tabs are visible and (later)
  rename/reorder fields inline.

The work was broken into **5 phases** plus a follow-up round of test
data + reports.

---

## 2. Phase 1 — Tab shell + foundations

### Schema additions

`prisma/schema.prisma` got the following:

- `Family` gained shared household state: `addressStreet`,
  `addressHood`, `addressPostal`, `addressCity`, `addressCountry`, plus
  four separate image-rights toggles (`imageRightsSite`,
  `imageRightsBook`, `imageRightsSocial`, `imageRightsRadio`) and an
  answered-at timestamp.
- `Application` gained `monoParental`, `dossierAnswers` (free-form JSON
  bag namespaced per tab), `tabsCompleted` (per-tab completion flags).
- `Tenant` gained `inscriptionTabsConfig` (per-tenant tab visibility).
- 3 new tables:
  - `ApplicationResponsable` — multi-row parents with Lebanese
    registry, employment, custody, marital status, etc.
  - `ApplicationContact` — `kind: URGENCE | PICKUP` with name, photo,
    relation, two phones.
  - `ApplicationSibling` — siblings at other schools (informational).
- Two new enums: `ResponsableKind`, `ContactKind`.

### Components

- `src/lib/dossier-tabs.ts` — single source of truth for the 10 tab
  keys: `eleve · responsables · foyer · scolarite · sante · transport ·
  contacts · finance · justificatifs · validation`. Includes the
  default visibility (Montaigne hides Santé / Finance / Justificatifs),
  parser, `visibleTabs()`, completion checker, remaining counter.
- `src/components/dossier/tab-strip.tsx` — horizontal tab nav with
  per-tab REMPLI ✓ / À REMPLIR badges, brand colour on active.
- `src/components/dossier/bottom-bar.tsx` — sticky Précédent / Envoyer
  le dossier / Suivant bar + "À COMPLÉTER: N" pill. Submission goes
  through the existing `submitDossier` action.

### Page wiring

- Refactored `src/app/(app)/parent/inscriptions/[id]/edit/page.tsx`
  into a tab-aware shell. `?tab=...` URL param. Per-tab content slots.
- Phase 1 shipped with Élève (existing dossier identity + student
  custom fields), Responsables (existing parent custom fields), and a
  placeholder card for the eight other tabs with a "Marquer comme
  rempli (aperçu)" debug toggle.

### i18n

- Full FR/EN/AR for the tab strip, bottom bar, badges, navigation
  buttons, placeholder copy.

---

## 3. Phase 2 — Foyer + Scolarité + Transport

### Library

`src/lib/dossier-content.ts` — typed shapes + defensive JSON parsing +
per-tab `is{Tab}Complete()` validators for the three new tabs.

### Server actions (in `parent/inscriptions/_actions.ts`)

- `saveFoyerTab` — address + 4 image-rights toggles → **Family** row,
  building/floor/details/notes → `dossierAnswers.foyer`, siblings →
  ApplicationSibling rows. Auto-marks `tabsCompleted.foyer`.
- `saveScolariteTab` — full Scolarité data → `dossierAnswers.scolarite`.
  Later extended to also save establishmentId + niveau columns +
  pedagogical answers.
- `saveTransportTab` — Transport answers → `dossierAnswers.transport`.

### Tab components

- `_tab-foyer.tsx` — Lebanon caza→village cascading address, building
  / floor / détails / remarques, multi-row Siblings table (add/remove),
  4 image-rights yes/no toggles.
- `_tab-scolarite.tsx` — Établissement précédent + Réseau (MLF / AEFE /
  autre), MLF history Y/N, 3-row history table, **double EBEP block**
  (previous + current school) with PAI/PAP/PPS/PPRE/AESH pills, 4
  Bilan checkboxes (orthophonique, psychologique, psychomoteur,
  psycho-pédiatrique), dispense radio with Oct-15 récépissé warning
  banner, niveau souhaité (date d'entrée; Section dropped later).
- `_tab-transport.tsx` — Bus / Avec les parents picker per direction
  (aller + retour), alternate pickup address toggle + full form
  (Lebanon caza→village cascading), collation + cantine yes/no with
  maternelle-mandatory hint.

---

## 4. Phase 3 — Pedagogical rules engine (per-niveau)

### Niveau classifier

`src/lib/pedagogique.ts` — `classifyNiveau()` maps any niveau string
(CE2, 6e, 2nde, 1ère, Tle, etc.) to `"ce2_3eme" | "seconde" |
"premiere" | "terminale" | null`. Permissive matching (Tle / Term /
Terminale all match).

Catalogues hardcoded for v1:

- `SPECIALITES`: LLCE anglais, Physique-Chimie, SVT, Maths, SES, HGGSP,
  HLP
- `LVA_OPTIONS`: arabe, anglais
- `LVB_OPTIONS_2NDE` / `LVB_OPTIONS_LYCEE`: arabe, anglais, espagnol
- `LVC_OPTIONS`: arabe, espagnol

### Component

`_section-pedagogique.tsx` — single card with 4 conditional sub-blocks:

| Group | Renders |
|---|---|
| CE2 → 3ème | ALE / ALM radio pair |
| 2nde | LVA + LVB selects + LVC multi-pick + Arts plastiques / SI-CIT / Section Internationale (BFI) |
| 1ère | 3 spécialités (capped) + LVA/LVB/LVC + Arts plastiques + BFI + Complément libanais Physique |
| Tle | 2 spécialités + LVA/LVB/LVC + Arts plastiques + Maths radio (none/comp/expertes, mutually exclusive) + Complément libanais Physique+SVT |

Below CE2 → nothing renders (no choice to make at that age).

State lives in `DossierTabScolarite`; the Pédagogique card re-renders
live when the parent changes niveau in the wishlist card.

Persistence: `saveScolariteTab` also writes `dossierAnswers.pedagogique`
and factors per-group completion into the Scolarité REMPLI badge.

---

## 5. Phase 4 — Autres contacts + Santé + Finance + Validation

### Autres contacts

`_tab-contacts.tsx` — card+modal pattern:

- Two stacked lists: **Urgence** (au moins 1 obligatoire) + **Pickup**
  (optionnel) with a 72H notice banner.
- Each card: photo placeholder + name + relation + phone summary,
  click to edit.
- Modal: Relation dropdown reusing the 13 RESPONSABLE_RELATIONS,
  Nom/Prénom required, Mobile + Domicile phones, Delete inside the
  modal.
- Server actions: `saveContact` (create or update) +
  `deleteContact`. Both refresh `tabsCompleted.contacts` based on
  having ≥ 1 URGENCE contact.

### Santé

`_tab-sante.tsx` — Hidden by default for Montaigne (their paper form
doesn't capture it). Fields:

- Allergies (textarea)
- Traitement(s) en cours
- Médecin traitant + téléphone
- Vaccinations à jour (Y/N)
- PAI (Y/N) + détails textarea when Yes
- Régime alimentaire spécifique
- Notes

Completion fires once both yes/no questions are answered.

### Finance

`_tab-finance.tsx` — Hidden by default for Montaigne. Three cards:

1. Règlement intérieur + Règlement financier (each with download
   prompt + ack checkbox).
2. Droits d'entrée MLF (NON REMBOURSABLE warning + ack checkbox).
3. Comité des parents Y/N.
4. Caisse de solidarité dual-currency picker — LBP buckets
   3 000 000 / 6 000 000 / 9 000 000 / opt-out / Autre montant **and**
   USD buckets 30 / 60 / 90 / opt-out / Autre montant.

Completion: 3 acks ticked + comité answered.

### Validation

`_tab-validation.tsx` — Reference documents list (markdown blob, empty
placeholder for now) + final "j'ai pris connaissance" checkbox. Toggle
flips `tabsCompleted.validation` immediately.

The bottom bar's **Envoyer le dossier** CTA fires `submitDossier`
once all visible tabs are REMPLI. Missing-required errors surface
the list of incomplete fields in a toast.

---

## 6. Phase 5 v1 — Admin inscription-config page

Route: `/admin/inscription-config`

What it ships today:

- **Tab visibility toggles** for the 10 tabs (saves to
  `Tenant.inscriptionTabsConfig`, propagates live to every parent's
  dossier).
- **Link** to the existing `/settings` → Forms flat field-config
  editor for tenant custom fields (no duplication).
- **Roadmap card** listing the WYSIWYG inline editor work that's still
  ahead (inline label rename + drag-reorder + per-field show-if rules
  overlaid on the parent form).

What's NOT in v1 (deferred):

- The full WYSIWYG overlay on the actual parent form (≥ 5 days of
  work — needs a `Tenant.inscriptionFormConfig` schema, a resolver
  threaded through every hardcoded card, an edit-mode overlay with
  per-field pencil affordances, save/diff/revert UX).
- Built-in field rename/required/options overrides for the hardcoded
  fields (état civil, passport, foyer, etc.).

The existing `/settings` → Forms editor still covers add / remove /
rename / required / options / show-if / hide-if for **custom** fields
on Élève and Responsables tabs.

---

## 7. Restructure of the Élève tab (mid-session pivot)

User asked for the Élève tab to stop duplicating fields. The final
layout is **two cards**:

1. **État civil de l'élève** — Nom + Prénom (FR), nom AR + prénom AR
   (RTL row), Date de naissance, Sexe, Ville + Pays de naissance.
   Establishment + Niveau moved out of here.
2. **Passeport / Carte d'identité** — Nationalité libanaise Oui/Non
   (Lebanese passport / ID input appears inline when Oui) + 2 other
   nationalities (Nat 1 required only if non-Lebanese).

The tenant's custom student-fields card was **removed entirely** from
the Élève tab. Admin can prune leftover orphaned fields from
`/settings` → Forms.

Establishment + Niveau **moved to the Scolarité tab** under
"Scolarité souhaitée", along with:

- A read-only **École** field showing `Tenant.name` (e.g. "Lycée
  Montaigne") — pulled from the tenant record, can't be edited.
- **Date d'entrée souhaitée** pre-filled from
  `AdmissionCycle.schoolStartDate` (admin-defined first day of school).

---

## 8. Responsables tab additions

- New "Identité du responsable" card at the top, in this order:
  1. **Relation avec l'enfant** dropdown — 13 options (Père / Mère /
     Beau-père / Belle-mère / Grand-père / Grand-mère / Frère / Sœur /
     Oncle / Tante / Cousin / Tuteur / Non défini).
  2. **Nationalité libanaise** Oui/Non — N° passeport / CI libanaise
     input appears inline when Oui.
  3. **Nationalité 1 + Nationalité 2** dropdowns (Nat 1 required when
     non-Lebanese).
- **Footer row** at the bottom of the tab:
  - **"+ Ajouter un responsable"** button — stub for now, shows
    "Disponible prochainement" toast.
  - **Famille monoparentale** checkbox — fully wired,
    instant-save to `Application.monoParental`.

Column adds on `Application`: `submitterRelation`, `submitterIsLebanese`,
`submitterPassportLebanese`, `submitterNationality`,
`submitterNationality2`. (Will migrate to `ApplicationResponsable`
rows once the multi-responsable UI is built.)

---

## 9. Cycle improvements

- `AdmissionCycle.schoolStartDate` (new column) — admin sets the first
  day of class per cycle. Pre-fills the parent's "Date d'entrée
  souhaitée".
- Cycle create + edit forms include the field with hint.

---

## 10. Test data tooling

### Wipe script — `prisma/wipe-all-parents.ts`

- Lists all tenants up-front.
- Refuses to run silently when multiple tenants exist — operator must
  pick `--tenant=<id>` or `--tenant-name=<query>`.
- Dry-run by default; `--confirm` actually deletes.
- Scope is **tenant-local**: only PARENT users + their data inside the
  chosen tenant are deleted. Other tenants are untouched.

```powershell
npx tsx prisma/wipe-all-parents.ts                                      # show tenants + counts
npx tsx prisma/wipe-all-parents.ts --tenant-name=Montaigne --confirm    # wipe Montaigne only
```

### Seed script — `prisma/seed-random-families.ts`

- 500 PARENT users (configurable via `--count=`).
- 1-4 kids per family (weighted 30 / 45 / 20 / 5 %).
- Full Application data for each kid: FR + AR names, Lebanese Yes/No
  + passport, 1-2 nationalities, niveau-conditional pedagogique
  answers, transport + restauration choices, finance acks + caisse
  picks, emergency contact.
- Lebanese names + caza/village/street pools hardcoded inside the
  script.
- Status mix: 55 % DRAFT · 30 % SUBMITTED · 10 % UNDER_REVIEW · 5 %
  ACCEPTED.
- `tabsCompleted` flipped fully green on non-DRAFT rows so admin lists
  look real.
- Reproducible RNG (seed = 42_424_242).
- Same tenant-safety rules as the wipe script.

```powershell
npx tsx prisma/seed-random-families.ts --list-tenants
npx tsx prisma/seed-random-families.ts --tenant-name=Montaigne                # 500
npx tsx prisma/seed-random-families.ts --tenant-name=Montaigne --count=100    # smaller
```

### List admin logins — `prisma/list-admin-logins.ts`

Read-only. Prints every tenant + their SCHOOL_ADMIN users with email +
status + created date. Useful when you forget which email runs which
school.

---

## 11. Reports section — `/admin/reports`

Landing page with 4 report cards.

| Report | Source data | CSV columns |
|---|---|---|
| **Transport & restauration** | `dossierAnswers.transport` | child, établissement, niveau, aller, retour, collation, cantine, alt-address |
| **Finance** | `dossierAnswers.finance` | child, niveau, 3× ack, comité, caisse LBP, caisse USD |
| **Pédagogie** | `dossierAnswers.pedagogique` | child, niveau, arabe (CE2-3ème), LVA / LVB / LVC, spécialités, BFI |
| **Nationalités** | Application columns | child, niveau, Libanais?, passeport libanais, nat1, nat2, pays naissance |

Each report has:

- Live search box (filters preview table)
- Cycle dropdown
- Row counter
- **Exporter en CSV** button — full filtered dataset with UTF-8 BOM so
  Excel opens it cleanly
- Preview capped at 500 rows; CSV contains everything

`csv()` helper in `_actions.ts` does RFC 4180 escaping (no
papaparse dependency).

---

## 12. Other settings & UX work in the same session

- `/settings` page reorganised into **5 categorical sections** via
  left-side nav: Identity / Billing & email / Structure / Forms /
  Appearance.
- New `/settings` section: **"Formulaire « Ajouter un parent »"** —
  per-tenant config (`Tenant.parentCreateFieldsConfig`) that lets
  admin pick which built-in fields (firstName / lastName / relation /
  locale) are required / optional / hidden on `/admin/parents/new`,
  plus add custom fields rendered on creation. Custom answers land in
  `User.customAnswers`.
- Admin **parents list** + **admissions list** got bulk-selection
  scaffolding: per-row + select-all checkboxes, a floating toolbar
  with bulk Archive / Unarchive / Delete / Restore / Permanent-delete,
  three-section view (Active / Archived / Deleted). Shared
  `src/components/bulk-selection.tsx` context + checkbox primitives.
- Parent applications list got **swipe-to-archive (left) /
  swipe-to-delete (right)** with `motion/react`, reduced-motion
  fallback to static buttons.

---

## 13. What's still pending

- **Multi-responsable UI** (currently a stub "Ajouter un responsable"
  button) — needs the real multi-row form using the
  `ApplicationResponsable` table that already exists in the schema.
- **WYSIWYG inscription-config editor** — inline label rename +
  drag-reorder + per-field show-if rules overlaid on the parent form.
- **Justificatifs tab** — hidden for Montaigne but the placeholder is
  there; wiring it up means re-using the existing `ApplicationDocument`
  upload flow inside the new tab shell.
- **Validation reference table** — admin can't edit it yet (renders
  empty placeholder). Needs either a markdown textarea in /settings or
  a structured table builder.
- **`prisma generate` always-needed reminder**: stop the dev server
  first on Windows (DLL lock on the Prisma engine).

---

## 14. Useful operator commands

```powershell
# Always after schema changes — stop dev server first:
npx prisma db push
npx prisma generate

# See who's in the DB:
npx tsx prisma/list-admin-logins.ts

# Wipe + reseed Montaigne specifically:
npx tsx prisma/wipe-all-parents.ts --tenant-name=Montaigne --confirm
npx tsx prisma/seed-random-families.ts --tenant-name=Montaigne

# Cleanup leftover photo-authorization fields from tenant configs:
npx tsx prisma/remove-student-photo-field.ts --confirm
```

---

## 15. File map (key paths)

```
prisma/
  schema.prisma                      ← all model + enum additions
  wipe-all-parents.ts                ← tenant-scoped wipe
  seed-random-families.ts            ← 500-family seeder
  list-admin-logins.ts               ← read-only login list
  remove-student-photo-field.ts      ← one-off field cleanup

src/lib/
  dossier-tabs.ts                    ← 10-tab visibility + completion
  dossier-content.ts                 ← Foyer / Scolarité / Transport types
  pedagogique.ts                     ← niveau classifier + catalogues
  parent-create-config.ts            ← /admin/parents/new field config

src/components/dossier/
  tab-strip.tsx
  bottom-bar.tsx

src/components/
  bulk-selection.tsx                 ← shared bulk-select primitives

src/app/(app)/parent/inscriptions/[id]/edit/
  page.tsx                           ← tab-aware shell
  _section-eleve-etat-civil.tsx
  _section-eleve-passport.tsx
  _section-responsable-lebanese.tsx
  _section-responsable-footer.tsx
  _section-pedagogique.tsx
  _tab-foyer.tsx
  _tab-scolarite.tsx
  _tab-transport.tsx
  _tab-contacts.tsx
  _tab-sante.tsx
  _tab-finance.tsx
  _tab-validation.tsx
  _tab-placeholder.tsx               ← only used for Justificatifs now

src/app/(app)/parent/inscriptions/_actions.ts
  ← all save* server actions for every tab + submitDossier

src/app/(app)/admin/inscription-config/
  page.tsx
  _tabs-form.tsx
  _actions.ts

src/app/(app)/admin/reports/
  page.tsx                           ← landing
  _report-view.tsx                   ← shared table + CSV download
  _actions.ts                        ← query helpers + csv() builder
  transport/page.tsx
  finance/page.tsx
  pedagogique/page.tsx
  nationalites/page.tsx
```

---

End of log.
