/**
 * Inscription dossier — field registry.
 *
 * Single source of truth for every HARDCODED field on the 10-tab parent
 * inscription dossier. Each entry holds the default label per locale
 * (FR/EN/AR), the field type, and whether it's required out of the box.
 *
 * Tenant overrides live in `Tenant.inscriptionFormConfig` (sparse — only
 * diverging keys). The resolver in `inscription-fields-resolver.ts`
 * merges defaults from this registry with the tenant overrides at read
 * time. This file is the immutable baseline.
 *
 * Key shape is `{tab}.{section}.{field}`, with one deliberate exception:
 * the Pédagogique section nested inside the Scolarité tab uses
 * `scolarite.pedagogique.{niveau_group}.{field}` (4 segments) because
 * its fields are split across four conditional niveau sub-blocks (CE2 →
 * 3ème · 2nde · 1ère · Terminale). The fourth segment is the niveau
 * group, exposed on the entry as `subSection`.
 *
 * The Justificatifs tab has no hardcoded fields registered — its content
 * is entirely admin-defined (ApplicationDocument requirements) and lives
 * in a separate config. Same for the Validation tab's reference-docs
 * markdown block.
 *
 * v1 covers ~110 fields. Adding a new hardcoded dossier field means:
 *   1. Append a registry entry below.
 *   2. (Optional) Add an EN/AR translation in `src/i18n/messages/`.
 */

// The 10 inscription dossier tabs — must match `DossierTabKey` in
// `src/lib/dossier-tabs.ts`. Listed here verbatim to keep this file
// self-contained and avoid a circular import.
export type DossierTab =
  | "eleve"
  | "responsables"
  | "foyer"
  | "scolarite"
  | "sante"
  | "transport"
  | "contacts"
  | "finance"
  | "justificatifs"
  | "validation";

// Field type vocabulary. v1 editor only customises label / required /
// hidden; the type drives how the resolver-aware components render the
// field. Keep this list closed so we know exactly what the WYSIWYG
// drawer has to support per type.
export type DossierFieldType =
  | "text"
  | "textarea"
  | "boolean"
  | "select"
  | "multi_select"
  | "date"
  | "phone"
  | "radio_group"
  | "number";

export type DossierFieldLabel = {
  fr: string;
  en: string;
  ar: string;
};

export type DossierFieldEntry = {
  tab: DossierTab;
  /** Logical sub-grouping inside the tab. Maps 1:1 to a card on the page. */
  section: string;
  /**
   * Optional conditional sub-block — currently only used by the
   * Pédagogique section, where fields belong to one of four niveau
   * groups (ce2_3eme · seconde · premiere · terminale).
   */
  subSection?: string;
  type: DossierFieldType;
  defaultLabel: DossierFieldLabel;
  defaultRequired: boolean;
  /**
   * True when this field's required-ness depends on another field's
   * value at runtime (e.g. "passport number" is only required when
   * "Lebanese=Yes"). The resolver does NOT act on this — it's
   * metadata for the editor drawer so admin sees the constraint.
   */
  conditionalRequired?: boolean;
  /**
   * True when this field's visibility depends on another field's value
   * at runtime (e.g. alternate-address fields only show when the
   * "alternate address" toggle is on). Again — metadata for the editor.
   */
  conditionallyVisible?: boolean;
  /**
   * One-line note rendered in the editor drawer to explain quirks
   * ("only shown when X=Yes"). FR-only; admins are bilingual.
   */
  note?: string;
};

// ──────────────────────────────────────────────────────────────────────
// THE REGISTRY
//
// Ordered by tab in the same order parents see them, then by section in
// rendered order. Use the same ordering when adding new entries — the
// editor renders entries in registry order until we add explicit
// reorder support in v2.
// ──────────────────────────────────────────────────────────────────────

export const INSCRIPTION_FIELDS_REGISTRY = {
  // ─────────────────────── Élève ───────────────────────

  // Section: État civil
  "eleve.etatCivil.lastName": {
    tab: "eleve",
    section: "etatCivil",
    type: "text",
    defaultLabel: {
      fr: "Nom de l'enfant",
      en: "Child last name",
      ar: "الشهرة",
    },
    defaultRequired: true,
  },
  "eleve.etatCivil.firstName": {
    tab: "eleve",
    section: "etatCivil",
    type: "text",
    defaultLabel: {
      fr: "Prénom de l'enfant",
      en: "Child first name",
      ar: "الاسم",
    },
    defaultRequired: true,
  },
  "eleve.etatCivil.lastNameAr": {
    tab: "eleve",
    section: "etatCivil",
    type: "text",
    defaultLabel: {
      fr: "الشهرة (Nom de l'enfant en arabe)",
      en: "الشهرة (Last name in Arabic)",
      ar: "الشهرة",
    },
    defaultRequired: true,
  },
  "eleve.etatCivil.firstNameAr": {
    tab: "eleve",
    section: "etatCivil",
    type: "text",
    defaultLabel: {
      fr: "الاسم (Prénom de l'enfant en arabe)",
      en: "الاسم (First name in Arabic)",
      ar: "الاسم",
    },
    defaultRequired: true,
  },
  "eleve.etatCivil.dob": {
    tab: "eleve",
    section: "etatCivil",
    type: "date",
    defaultLabel: {
      fr: "Date de naissance",
      en: "Date of birth",
      ar: "تاريخ الميلاد",
    },
    defaultRequired: true,
  },
  "eleve.etatCivil.gender": {
    tab: "eleve",
    section: "etatCivil",
    type: "select",
    defaultLabel: { fr: "Sexe", en: "Gender", ar: "الجنس" },
    defaultRequired: true,
  },
  "eleve.etatCivil.placeOfBirth": {
    tab: "eleve",
    section: "etatCivil",
    type: "text",
    defaultLabel: {
      fr: "Ville de naissance",
      en: "City of birth",
      ar: "مدينة الولادة",
    },
    defaultRequired: true,
  },
  "eleve.etatCivil.birthCountry": {
    tab: "eleve",
    section: "etatCivil",
    type: "select",
    defaultLabel: {
      fr: "Pays de naissance",
      en: "Country of birth",
      ar: "بلد الولادة",
    },
    defaultRequired: true,
  },
  "eleve.etatCivil.placeOfBirthAr": {
    tab: "eleve",
    section: "etatCivil",
    type: "text",
    defaultLabel: {
      fr: "مكان الولادة (Lieu de naissance en arabe)",
      en: "مكان الولادة (Place of birth in Arabic)",
      ar: "مكان الولادة",
    },
    defaultRequired: false,
  },

  // Section: Passeport / Carte d'identité
  "eleve.passport.isLebanese": {
    tab: "eleve",
    section: "passport",
    type: "boolean",
    defaultLabel: {
      fr: "Nationalité libanaise",
      en: "Lebanese nationality",
      ar: "الجنسية اللبنانية",
    },
    defaultRequired: true,
  },
  "eleve.passport.passportLebanese": {
    tab: "eleve",
    section: "passport",
    type: "text",
    defaultLabel: {
      fr: "N° passeport ou carte d'identité libanaise",
      en: "Lebanese passport / ID number",
      ar: "رقم جواز السفر أو بطاقة الهوية اللبنانية",
    },
    defaultRequired: true,
    conditionalRequired: true,
    conditionallyVisible: true,
    note: "Visible et obligatoire uniquement si « Nationalité libanaise » = Oui.",
  },
  "eleve.passport.nationality1": {
    tab: "eleve",
    section: "passport",
    type: "select",
    defaultLabel: {
      fr: "Nationalité 1",
      en: "Nationality 1",
      ar: "الجنسية 1",
    },
    defaultRequired: false,
    conditionalRequired: true,
    note: "Obligatoire si « Nationalité libanaise » = Non.",
  },
  "eleve.passport.nationality2": {
    tab: "eleve",
    section: "passport",
    type: "select",
    defaultLabel: {
      fr: "Nationalité 2",
      en: "Nationality 2",
      ar: "الجنسية 2",
    },
    defaultRequired: false,
  },

  // ─────────────────────── Responsables ───────────────────────

  // Section: Identité du responsable
  "responsables.identity.relation": {
    tab: "responsables",
    section: "identity",
    type: "select",
    defaultLabel: {
      fr: "Relation avec l'enfant",
      en: "Relation to the child",
      ar: "الصلة بالطفل",
    },
    defaultRequired: true,
  },
  "responsables.identity.isLebanese": {
    tab: "responsables",
    section: "identity",
    type: "boolean",
    defaultLabel: {
      fr: "Nationalité libanaise",
      en: "Lebanese nationality",
      ar: "الجنسية اللبنانية",
    },
    defaultRequired: true,
  },
  "responsables.identity.passportLebanese": {
    tab: "responsables",
    section: "identity",
    type: "text",
    defaultLabel: {
      fr: "N° passeport ou carte d'identité libanaise",
      en: "Lebanese passport / ID number",
      ar: "رقم جواز السفر أو بطاقة الهوية اللبنانية",
    },
    defaultRequired: true,
    conditionalRequired: true,
    conditionallyVisible: true,
    note: "Visible et obligatoire uniquement si « Nationalité libanaise » = Oui.",
  },
  "responsables.identity.nationality1": {
    tab: "responsables",
    section: "identity",
    type: "select",
    defaultLabel: {
      fr: "Nationalité 1",
      en: "Nationality 1",
      ar: "الجنسية 1",
    },
    defaultRequired: false,
    conditionalRequired: true,
    note: "Obligatoire si « Nationalité libanaise » = Non. Mêmes options que l'élève.",
  },
  "responsables.identity.nationality2": {
    tab: "responsables",
    section: "identity",
    type: "select",
    defaultLabel: {
      fr: "Nationalité 2",
      en: "Nationality 2",
      ar: "الجنسية 2",
    },
    defaultRequired: false,
  },

  // Section: Famille (footer)
  "responsables.family.monoParental": {
    tab: "responsables",
    section: "family",
    type: "boolean",
    defaultLabel: {
      fr: "Famille monoparentale",
      en: "Single-parent family",
      ar: "عائلة وحيدة الوالد",
    },
    defaultRequired: false,
  },

  // ─────────────────────── Foyer ───────────────────────

  // Section: Adresse du foyer
  "foyer.address.caza": {
    tab: "foyer",
    section: "address",
    type: "select",
    defaultLabel: { fr: "Caza", en: "Caza", ar: "القضاء" },
    defaultRequired: true,
  },
  "foyer.address.village": {
    tab: "foyer",
    section: "address",
    type: "select",
    defaultLabel: { fr: "Village", en: "Village", ar: "البلدة" },
    defaultRequired: true,
    note: "Sélection en cascade : dépend du caza choisi.",
  },
  "foyer.address.street": {
    tab: "foyer",
    section: "address",
    type: "text",
    defaultLabel: { fr: "Rue", en: "Street", ar: "الشارع" },
    defaultRequired: true,
  },
  "foyer.address.building": {
    tab: "foyer",
    section: "address",
    type: "text",
    defaultLabel: { fr: "Immeuble", en: "Building", ar: "البناية" },
    defaultRequired: false,
  },
  "foyer.address.floor": {
    tab: "foyer",
    section: "address",
    type: "text",
    defaultLabel: { fr: "Étage", en: "Floor", ar: "الطابق" },
    defaultRequired: false,
  },
  "foyer.address.details": {
    tab: "foyer",
    section: "address",
    type: "text",
    defaultLabel: {
      fr: "Détails (digicode, étage, etc.)",
      en: "Details (door code, floor, etc.)",
      ar: "تفاصيل (الرمز، الطابق...)",
    },
    defaultRequired: false,
  },
  "foyer.address.notes": {
    tab: "foyer",
    section: "address",
    type: "textarea",
    defaultLabel: { fr: "Remarques", en: "Notes", ar: "ملاحظات" },
    defaultRequired: false,
  },

  // Section: Frères et sœurs (dynamic list)
  "foyer.siblings.list": {
    tab: "foyer",
    section: "siblings",
    type: "multi_select",
    defaultLabel: {
      fr: "Frères et sœurs",
      en: "Brothers and sisters",
      ar: "الإخوة والأخوات",
    },
    defaultRequired: false,
    note: "Hider cache la section entière ; les enfants déjà inscrits restent visibles.",
  },
  "foyer.siblings.firstName": {
    tab: "foyer",
    section: "siblings",
    type: "text",
    defaultLabel: { fr: "Prénom", en: "First name", ar: "الاسم الأول" },
    defaultRequired: false,
    note: "Colonne par ligne dans la liste « Frères et sœurs ».",
  },
  "foyer.siblings.birthYear": {
    tab: "foyer",
    section: "siblings",
    type: "number",
    defaultLabel: { fr: "Année", en: "Year", ar: "السنة" },
    defaultRequired: false,
  },
  "foyer.siblings.className": {
    tab: "foyer",
    section: "siblings",
    type: "text",
    defaultLabel: {
      fr: "Classe actuelle",
      en: "Current class",
      ar: "الصف الحالي",
    },
    defaultRequired: false,
  },
  "foyer.siblings.schoolName": {
    tab: "foyer",
    section: "siblings",
    type: "text",
    defaultLabel: {
      fr: "Établissement actuel",
      en: "Current school",
      ar: "المدرسة الحالية",
    },
    defaultRequired: false,
  },

  // Section: Autorisation de prise de vue / publication.
  // These four consents were MOVED out of Foyer and render on the AUTORISATIONS
  // tab (System-A auth_* fields). `tab` stays "foyer" (this self-contained
  // DossierTab union has no "autorisations", and the keys deliberately keep the
  // `foyer.imageRights.*` prefix so existing WYSIWYG overrides +
  // evaluateAutorisationsComplete keep resolving by key). The unified /settings
  // editor therefore excludes this section from the Foyer tab — see
  // loadInscriptionRegistry in settings/_actions.ts.
  "foyer.imageRights.site": {
    tab: "foyer",
    section: "imageRights",
    type: "boolean",
    defaultLabel: {
      fr: "Site internet",
      en: "Website",
      ar: "موقع الإنترنت",
    },
    defaultRequired: false,
  },
  "foyer.imageRights.book": {
    tab: "foyer",
    section: "imageRights",
    type: "boolean",
    defaultLabel: {
      fr: "Livre souvenir",
      en: "Yearbook",
      ar: "كتاب الذكريات",
    },
    defaultRequired: false,
  },
  "foyer.imageRights.social": {
    tab: "foyer",
    section: "imageRights",
    type: "boolean",
    defaultLabel: {
      fr: "Réseaux sociaux",
      en: "Social networks",
      ar: "وسائل التواصل",
    },
    defaultRequired: false,
  },
  "foyer.imageRights.radio": {
    tab: "foyer",
    section: "imageRights",
    type: "boolean",
    defaultLabel: { fr: "Web Radio", en: "Web radio", ar: "راديو الويب" },
    defaultRequired: false,
  },

  // ─────────────────────── Scolarité ───────────────────────

  // Section: Établissement précédent
  "scolarite.previous.school": {
    tab: "scolarite",
    section: "previous",
    type: "text",
    defaultLabel: {
      fr: "Établissement fréquenté",
      en: "School attended",
      ar: "المدرسة الملتحق بها",
    },
    defaultRequired: true,
  },
  "scolarite.previous.class": {
    tab: "scolarite",
    section: "previous",
    type: "text",
    defaultLabel: {
      fr: "Classe fréquentée",
      en: "Class attended",
      ar: "الصف الملتحق به",
    },
    defaultRequired: true,
  },
  "scolarite.previous.network": {
    tab: "scolarite",
    section: "previous",
    type: "select",
    defaultLabel: {
      fr: "Réseau de l'établissement",
      en: "School network",
      ar: "شبكة المدرسة",
    },
    defaultRequired: false,
  },
  "scolarite.previous.attendedMlfBefore": {
    tab: "scolarite",
    section: "previous",
    type: "boolean",
    defaultLabel: {
      fr: "Déjà scolarisé dans un établissement MLF ?",
      en: "Previously enrolled in an MLF school?",
      ar: "هل تم الالتحاق سابقًا بمدرسة من شبكة MLF؟",
    },
    defaultRequired: true,
  },

  // Section: Scolarité antérieure (3 dernières années — dynamic list)
  "scolarite.history.list": {
    tab: "scolarite",
    section: "history",
    type: "multi_select",
    defaultLabel: {
      fr: "Scolarité antérieure (3 dernières années)",
      en: "School history (last 3 years)",
      ar: "المسار الدراسي (آخر 3 سنوات)",
    },
    defaultRequired: false,
  },
  "scolarite.history.year": {
    tab: "scolarite",
    section: "history",
    type: "text",
    defaultLabel: {
      fr: "Année scolaire",
      en: "School year",
      ar: "السنة الدراسية",
    },
    defaultRequired: false,
    note: "Colonne par ligne dans la liste « Scolarité antérieure ».",
  },
  "scolarite.history.className": {
    tab: "scolarite",
    section: "history",
    type: "text",
    defaultLabel: { fr: "Classe", en: "Class", ar: "الصف" },
    defaultRequired: false,
  },
  "scolarite.history.school": {
    tab: "scolarite",
    section: "history",
    type: "text",
    defaultLabel: {
      fr: "Établissement (nom + localité)",
      en: "School (name + city)",
      ar: "المدرسة (الاسم + المدينة)",
    },
    defaultRequired: false,
  },

  // Section: EBEP — Élèves à besoins éducatifs particuliers
  "scolarite.ebep.previous": {
    tab: "scolarite",
    section: "ebep",
    type: "boolean",
    defaultLabel: {
      fr: "Bénéficiait d'un aménagement dans l'établissement précédent ?",
      en: "Had accommodations at the previous school?",
      ar: "هل استفاد من ترتيبات في المدرسة السابقة؟",
    },
    defaultRequired: true,
  },
  "scolarite.ebep.current": {
    tab: "scolarite",
    section: "ebep",
    type: "boolean",
    defaultLabel: {
      fr: "Devra bénéficier d'un aménagement au sein de notre établissement ?",
      en: "Will need accommodations at our school?",
      ar: "هل سيحتاج إلى ترتيبات في مدرستنا؟",
    },
    defaultRequired: true,
  },

  // Section: Bilan(s) déjà réalisé(s)
  "scolarite.bilans.orthophonique": {
    tab: "scolarite",
    section: "bilans",
    type: "boolean",
    defaultLabel: {
      fr: "Orthophonique",
      en: "Speech therapy",
      ar: "أرطفوني",
    },
    defaultRequired: false,
  },
  "scolarite.bilans.psychologique": {
    tab: "scolarite",
    section: "bilans",
    type: "boolean",
    defaultLabel: { fr: "Psychologique", en: "Psychological", ar: "نفسي" },
    defaultRequired: false,
  },
  "scolarite.bilans.psychomoteur": {
    tab: "scolarite",
    section: "bilans",
    type: "boolean",
    defaultLabel: {
      fr: "Psychomoteur",
      en: "Psychomotor",
      ar: "حركي نفسي",
    },
    defaultRequired: false,
  },
  "scolarite.bilans.psychoPediatrique": {
    tab: "scolarite",
    section: "bilans",
    type: "boolean",
    defaultLabel: {
      fr: "Psycho-pédiatrique",
      en: "Pediatric psychology",
      ar: "نفسي طب أطفال",
    },
    defaultRequired: false,
  },

  // Section: Dispense des examens officiels libanais
  "scolarite.dispense.libanais": {
    tab: "scolarite",
    section: "dispense",
    type: "radio_group",
    defaultLabel: {
      fr: "Programme libanais",
      en: "Lebanese curriculum",
      ar: "البرنامج اللبناني",
    },
    defaultRequired: true,
  },

  // Section: Scolarité souhaitée
  "scolarite.wishlist.establishment": {
    tab: "scolarite",
    section: "wishlist",
    type: "select",
    defaultLabel: {
      fr: "Établissement",
      en: "Establishment",
      ar: "المؤسسة",
    },
    defaultRequired: true,
  },
  "scolarite.wishlist.niveau": {
    tab: "scolarite",
    section: "wishlist",
    type: "select",
    defaultLabel: { fr: "Niveau", en: "Level", ar: "المرحلة" },
    defaultRequired: true,
    note: "Cascade : dépend de l'établissement sélectionné.",
  },
  "scolarite.wishlist.entryDate": {
    tab: "scolarite",
    section: "wishlist",
    type: "date",
    defaultLabel: {
      fr: "Date d'entrée souhaitée",
      en: "Desired entry date",
      ar: "تاريخ الدخول المطلوب",
    },
    defaultRequired: true,
  },

  // Section: Pédagogique — CE2 → 3ème
  "scolarite.pedagogique.ce2_3eme.arabe": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "ce2_3eme",
    type: "radio_group",
    defaultLabel: {
      fr: "Programme d'arabe",
      en: "Arabic program",
      ar: "برنامج اللغة العربية",
    },
    defaultRequired: true,
    conditionallyVisible: true,
    note: "Visible uniquement pour CE2 → 3ème (déterminé par le niveau souhaité).",
  },

  // Section: Pédagogique — 2nde
  "scolarite.pedagogique.seconde.lva": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "seconde",
    type: "select",
    defaultLabel: { fr: "LVA", en: "LVA", ar: "اللغة الحية A" },
    defaultRequired: true,
    conditionallyVisible: true,
    note: "Visible uniquement pour la 2nde.",
  },
  "scolarite.pedagogique.seconde.lvb": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "seconde",
    type: "select",
    defaultLabel: { fr: "LVB", en: "LVB", ar: "اللغة الحية B" },
    defaultRequired: true,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.seconde.lvc": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "seconde",
    type: "multi_select",
    defaultLabel: {
      fr: "LVC (langue vivante C)",
      en: "LVC (third foreign language)",
      ar: "اللغة الحية C",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.seconde.artsPlastiques": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "seconde",
    type: "boolean",
    defaultLabel: {
      fr: "Arts plastiques",
      en: "Visual arts",
      ar: "الفنون التشكيلية",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.seconde.siCit": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "seconde",
    type: "boolean",
    defaultLabel: {
      fr: "Sciences de l'Ingénieur (SI-CIT)",
      en: "Engineering Sciences (SI-CIT)",
      ar: "علوم الهندسة (SI-CIT)",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.seconde.bfi": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "seconde",
    type: "boolean",
    defaultLabel: {
      fr: "Section internationale (BFI)",
      en: "International section (BFI)",
      ar: "القسم الدولي (BFI)",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },

  // Section: Pédagogique — 1ère
  "scolarite.pedagogique.premiere.specialites": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "premiere",
    type: "multi_select",
    defaultLabel: {
      fr: "Spécialités (3 choix)",
      en: "Specialties (pick 3)",
      ar: "الاختصاصات (3)",
    },
    defaultRequired: true,
    conditionallyVisible: true,
    note: "Visible uniquement pour la 1ère. Exactement 3 choix attendus.",
  },
  "scolarite.pedagogique.premiere.lva": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "premiere",
    type: "select",
    defaultLabel: { fr: "LVA", en: "LVA", ar: "اللغة الحية A" },
    defaultRequired: true,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.premiere.lvb": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "premiere",
    type: "select",
    defaultLabel: { fr: "LVB", en: "LVB", ar: "اللغة الحية B" },
    defaultRequired: true,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.premiere.lvc": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "premiere",
    type: "multi_select",
    defaultLabel: {
      fr: "LVC (langue vivante C)",
      en: "LVC (third foreign language)",
      ar: "اللغة الحية C",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.premiere.artsPlastiques": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "premiere",
    type: "boolean",
    defaultLabel: {
      fr: "Arts plastiques",
      en: "Visual arts",
      ar: "الفنون التشكيلية",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.premiere.bfi": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "premiere",
    type: "boolean",
    defaultLabel: { fr: "BFI", en: "BFI", ar: "BFI" },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.premiere.complementLibanaisPhysique": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "premiere",
    type: "boolean",
    defaultLabel: {
      fr: "Complément libanais — Physique",
      en: "Lebanese complement — Physics",
      ar: "تكملة لبنانية — فيزياء",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },

  // Section: Pédagogique — Terminale
  "scolarite.pedagogique.terminale.specialites": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "terminale",
    type: "multi_select",
    defaultLabel: {
      fr: "Spécialités (2 choix)",
      en: "Specialties (pick 2)",
      ar: "الاختصاصات (2)",
    },
    defaultRequired: true,
    conditionallyVisible: true,
    note: "Visible uniquement pour la Terminale. Exactement 2 choix attendus.",
  },
  "scolarite.pedagogique.terminale.lva": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "terminale",
    type: "select",
    defaultLabel: { fr: "LVA", en: "LVA", ar: "اللغة الحية A" },
    defaultRequired: true,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.terminale.lvb": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "terminale",
    type: "select",
    defaultLabel: { fr: "LVB", en: "LVB", ar: "اللغة الحية B" },
    defaultRequired: true,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.terminale.lvc": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "terminale",
    type: "multi_select",
    defaultLabel: {
      fr: "LVC (langue vivante C)",
      en: "LVC (third foreign language)",
      ar: "اللغة الحية C",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.terminale.artsPlastiques": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "terminale",
    type: "boolean",
    defaultLabel: {
      fr: "Arts plastiques",
      en: "Visual arts",
      ar: "الفنون التشكيلية",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "scolarite.pedagogique.terminale.maths": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "terminale",
    type: "radio_group",
    defaultLabel: {
      fr: "Mathématiques",
      en: "Mathematics",
      ar: "الرياضيات",
    },
    defaultRequired: false,
    conditionallyVisible: true,
    note: "3 états mutuellement exclusifs : aucun · complémentaires · expertes.",
  },
  "scolarite.pedagogique.terminale.complementLibanaisPhysiqueSvt": {
    tab: "scolarite",
    section: "pedagogique",
    subSection: "terminale",
    type: "boolean",
    defaultLabel: {
      fr: "Complément libanais — Physique + SVT",
      en: "Lebanese complement — Physics + Biology",
      ar: "تكملة لبنانية — فيزياء + علوم الحياة",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },

  // ─────────────────────── Santé ───────────────────────

  // Section: Informations de santé
  "sante.info.allergies": {
    tab: "sante",
    section: "info",
    type: "textarea",
    defaultLabel: {
      fr: "Allergies (alimentaires, médicamenteuses, autres)",
      en: "Allergies (food, medication, other)",
      ar: "الحساسية (طعامية، دوائية، أخرى)",
    },
    defaultRequired: false,
  },
  "sante.info.traitement": {
    tab: "sante",
    section: "info",
    type: "textarea",
    defaultLabel: {
      fr: "Traitement(s) en cours",
      en: "Ongoing treatment(s)",
      ar: "العلاجات الحالية",
    },
    defaultRequired: false,
  },
  "sante.info.doctorName": {
    tab: "sante",
    section: "info",
    type: "text",
    defaultLabel: {
      fr: "Médecin traitant",
      en: "Family doctor",
      ar: "طبيب العائلة",
    },
    defaultRequired: false,
  },
  "sante.info.doctorPhone": {
    tab: "sante",
    section: "info",
    type: "phone",
    defaultLabel: {
      fr: "Téléphone du médecin",
      en: "Doctor's phone",
      ar: "هاتف الطبيب",
    },
    defaultRequired: false,
  },
  "sante.info.vaccinationsUpToDate": {
    tab: "sante",
    section: "info",
    type: "boolean",
    defaultLabel: {
      fr: "Vaccinations à jour ?",
      en: "Vaccinations up to date?",
      ar: "اللقاحات محدّثة؟",
    },
    defaultRequired: true,
  },
  "sante.info.hasPai": {
    tab: "sante",
    section: "info",
    type: "boolean",
    defaultLabel: {
      fr: "L'enfant bénéficie-t-il d'un PAI (Projet d'Accueil Individualisé) ?",
      en: "Does the child have an individualized care plan (PAI)?",
      ar: "هل لدى الطفل خطة PAI؟",
    },
    defaultRequired: true,
  },
  "sante.info.paiDetails": {
    tab: "sante",
    section: "info",
    type: "textarea",
    defaultLabel: {
      fr: "Détails du PAI",
      en: "PAI details",
      ar: "تفاصيل PAI",
    },
    defaultRequired: false,
    conditionalRequired: true,
    conditionallyVisible: true,
    note: "Visible et obligatoire uniquement si « PAI » = Oui.",
  },
  "sante.info.diet": {
    tab: "sante",
    section: "info",
    type: "textarea",
    defaultLabel: {
      fr: "Régime alimentaire spécifique",
      en: "Specific diet",
      ar: "نظام غذائي خاص",
    },
    defaultRequired: false,
  },
  "sante.info.notes": {
    tab: "sante",
    section: "info",
    type: "textarea",
    defaultLabel: {
      fr: "Autres informations utiles",
      en: "Other useful info",
      ar: "معلومات أخرى مفيدة",
    },
    defaultRequired: false,
  },

  // ─────────────────────── Transport ───────────────────────

  // Section: Mode de transport
  "transport.mode.aller": {
    tab: "transport",
    section: "mode",
    type: "radio_group",
    defaultLabel: { fr: "Aller", en: "To school", ar: "الذهاب" },
    defaultRequired: true,
  },
  "transport.mode.retour": {
    tab: "transport",
    section: "mode",
    type: "radio_group",
    defaultLabel: { fr: "Retour", en: "From school", ar: "العودة" },
    defaultRequired: true,
  },

  // Section: Adresse alternative
  "transport.altAddress.enabled": {
    tab: "transport",
    section: "altAddress",
    type: "boolean",
    defaultLabel: {
      fr: "L'enfant est récupéré à une autre adresse",
      en: "The child is picked up at a different address",
      ar: "يتم استلام الطفل من عنوان آخر",
    },
    defaultRequired: false,
  },
  "transport.altAddress.caza": {
    tab: "transport",
    section: "altAddress",
    type: "select",
    defaultLabel: { fr: "Caza", en: "Caza", ar: "القضاء" },
    defaultRequired: false,
    conditionalRequired: true,
    conditionallyVisible: true,
    note: "Visible si l'adresse alternative est activée.",
  },
  "transport.altAddress.village": {
    tab: "transport",
    section: "altAddress",
    type: "select",
    defaultLabel: { fr: "Village", en: "Village", ar: "البلدة" },
    defaultRequired: false,
    conditionalRequired: true,
    conditionallyVisible: true,
  },
  "transport.altAddress.street": {
    tab: "transport",
    section: "altAddress",
    type: "text",
    defaultLabel: { fr: "Rue", en: "Street", ar: "الشارع" },
    defaultRequired: false,
    conditionalRequired: true,
    conditionallyVisible: true,
  },
  "transport.altAddress.building": {
    tab: "transport",
    section: "altAddress",
    type: "text",
    defaultLabel: { fr: "Immeuble", en: "Building", ar: "البناية" },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "transport.altAddress.floor": {
    tab: "transport",
    section: "altAddress",
    type: "text",
    defaultLabel: { fr: "Étage", en: "Floor", ar: "الطابق" },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "transport.altAddress.details": {
    tab: "transport",
    section: "altAddress",
    type: "text",
    defaultLabel: {
      fr: "Détails (digicode, étage, etc.)",
      en: "Details (door code, floor, etc.)",
      ar: "تفاصيل (الرمز، الطابق...)",
    },
    defaultRequired: false,
    conditionallyVisible: true,
  },
  "transport.altAddress.notes": {
    tab: "transport",
    section: "altAddress",
    type: "textarea",
    defaultLabel: { fr: "Remarques", en: "Notes", ar: "ملاحظات" },
    defaultRequired: false,
    conditionallyVisible: true,
  },

  // Section: Restauration
  "transport.restauration.collation": {
    tab: "transport",
    section: "restauration",
    type: "boolean",
    defaultLabel: {
      fr: "Collation (goûter à la 1ère récréation)",
      en: "Snack (1st-break)",
      ar: "الوجبة الخفيفة (في الفسحة الأولى)",
    },
    defaultRequired: true,
    note: "Obligatoire en maternelle (libellé alternatif affiché).",
  },
  "transport.restauration.cantine": {
    tab: "transport",
    section: "restauration",
    type: "boolean",
    defaultLabel: {
      fr: "Cantine (déjeuner)",
      en: "Cafeteria (lunch)",
      ar: "الكافيتيريا (الغداء)",
    },
    defaultRequired: true,
  },

  // ─────────────────────── Autres contacts ───────────────────────

  // Section: Contact en cas d'urgence (list)
  "contacts.urgence.list": {
    tab: "contacts",
    section: "urgence",
    type: "multi_select",
    defaultLabel: {
      fr: "Contact en cas d'urgence",
      en: "Emergency contact",
      ar: "جهة الاتصال في حالات الطوارئ",
    },
    defaultRequired: true,
    note: "Au moins une personne autre que les responsables est requise.",
  },
  // Section: Personne autorisée à récupérer l'enfant (list)
  "contacts.pickup.list": {
    tab: "contacts",
    section: "pickup",
    type: "multi_select",
    defaultLabel: {
      fr: "Personne autorisée à récupérer l'enfant",
      en: "Pickup-authorized person",
      ar: "الأشخاص المخوّلون باستلام الطفل",
    },
    defaultRequired: false,
  },

  // Section: Champs du contact (modal partagé entre les deux listes)
  "contacts.contact.relation": {
    tab: "contacts",
    section: "contact",
    type: "select",
    defaultLabel: {
      fr: "Relation avec l'enfant",
      en: "Relation to the child",
      ar: "الصلة بالطفل",
    },
    defaultRequired: false,
    note: "Champ du modal d'édition d'un contact.",
  },
  "contacts.contact.lastName": {
    tab: "contacts",
    section: "contact",
    type: "text",
    defaultLabel: { fr: "Nom", en: "Last name", ar: "اللقب" },
    defaultRequired: true,
  },
  "contacts.contact.firstName": {
    tab: "contacts",
    section: "contact",
    type: "text",
    defaultLabel: { fr: "Prénom", en: "First name", ar: "الاسم" },
    defaultRequired: true,
  },
  "contacts.contact.phoneMobile": {
    tab: "contacts",
    section: "contact",
    type: "phone",
    defaultLabel: {
      fr: "Téléphone mobile",
      en: "Mobile phone",
      ar: "الهاتف المحمول",
    },
    defaultRequired: false,
  },
  "contacts.contact.phoneHome": {
    tab: "contacts",
    section: "contact",
    type: "phone",
    defaultLabel: {
      fr: "Téléphone domicile",
      en: "Home phone",
      ar: "هاتف المنزل",
    },
    defaultRequired: false,
  },

  // ─────────────────────── Finance ───────────────────────

  // Section: Règlements
  "finance.reglements.ackInterieur": {
    tab: "finance",
    section: "reglements",
    type: "boolean",
    defaultLabel: {
      fr: "Je déclare avoir pris connaissance du règlement intérieur et en approuve les conditions.",
      en: "I have read the internal rules and accept the conditions.",
      ar: "أصرّح بأنني قرأت النظام الداخلي وأوافق على شروطه.",
    },
    defaultRequired: true,
  },
  "finance.reglements.ackFinancier": {
    tab: "finance",
    section: "reglements",
    type: "boolean",
    defaultLabel: {
      fr: "Je déclare avoir pris connaissance du règlement financier et en approuve les conditions.",
      en: "I have read the financial rules and accept the conditions.",
      ar: "أصرّح بأنني قرأت النظام المالي وأوافق على شروطه.",
    },
    defaultRequired: true,
  },

  // Section: Droits d'entrée MLF
  "finance.droitsMlf.ack": {
    tab: "finance",
    section: "droitsMlf",
    type: "boolean",
    defaultLabel: {
      fr: "Je déclare avoir pris connaissance des droits d'entrée dans le réseau MLF et m'engage à les régler.",
      en: "I acknowledge the MLF network entry fees and commit to paying them.",
      ar: "أصرّح بأنني اطلعت على رسوم الانتساب لشبكة MLF وألتزم بدفعها.",
    },
    defaultRequired: true,
  },

  // Section: Comité des parents
  "finance.comite.subscribe": {
    tab: "finance",
    section: "comite",
    type: "boolean",
    defaultLabel: {
      fr: "Souhaitez-vous adhérer au comité des parents ?",
      en: "Do you want to subscribe to the parents' committee?",
      ar: "هل ترغب بالانتساب إلى لجنة الأهل؟",
    },
    defaultRequired: true,
  },

  // Section: Caisse de solidarité
  "finance.caisse.lbp": {
    tab: "finance",
    section: "caisse",
    type: "radio_group",
    defaultLabel: {
      fr: "Montant en LBP",
      en: "Amount in LBP",
      ar: "المبلغ بالليرة اللبنانية",
    },
    defaultRequired: false,
  },
  "finance.caisse.lbpAutre": {
    tab: "finance",
    section: "caisse",
    type: "text",
    defaultLabel: {
      fr: "Montant LBP libre",
      en: "Free LBP amount",
      ar: "مبلغ ليرة لبنانية حر",
    },
    defaultRequired: false,
    conditionalRequired: true,
    conditionallyVisible: true,
    note: "Visible et obligatoire uniquement si « Montant LBP » = Autre.",
  },
  "finance.caisse.usd": {
    tab: "finance",
    section: "caisse",
    type: "radio_group",
    defaultLabel: {
      fr: "Montant en USD",
      en: "Amount in USD",
      ar: "المبلغ بالدولار الأميركي",
    },
    defaultRequired: false,
  },
  "finance.caisse.usdAutre": {
    tab: "finance",
    section: "caisse",
    type: "text",
    defaultLabel: {
      fr: "Montant USD libre",
      en: "Free USD amount",
      ar: "مبلغ دولار حر",
    },
    defaultRequired: false,
    conditionalRequired: true,
    conditionallyVisible: true,
    note: "Visible et obligatoire uniquement si « Montant USD » = Autre.",
  },

  // ─────────────────────── Validation ───────────────────────

  "validation.ack.acknowledged": {
    tab: "validation",
    section: "ack",
    type: "boolean",
    defaultLabel: {
      fr: "Je déclare avoir pris connaissance de la procédure d'inscription pour l'année visée.",
      en: "I acknowledge the registration procedure for the target year.",
      ar: "أصرّح بأنني اطلعت على إجراءات التسجيل للسنة المستهدفة.",
    },
    defaultRequired: true,
  },
} as const satisfies Record<string, DossierFieldEntry>;

// ──────────────────────────────────────────────────────────────────────
// Type-level + runtime helpers
// ──────────────────────────────────────────────────────────────────────

export type InscriptionFieldKey = keyof typeof INSCRIPTION_FIELDS_REGISTRY;

export const ALL_INSCRIPTION_FIELD_KEYS = Object.keys(
  INSCRIPTION_FIELDS_REGISTRY,
) as InscriptionFieldKey[];

export function getInscriptionFieldEntry(
  key: string,
): DossierFieldEntry | undefined {
  return (INSCRIPTION_FIELDS_REGISTRY as Record<string, DossierFieldEntry>)[
    key
  ];
}

/** All registered fields for a given tab, in registry order. */
export function fieldsForTab(tab: DossierTab): InscriptionFieldKey[] {
  return ALL_INSCRIPTION_FIELD_KEYS.filter(
    (k) => INSCRIPTION_FIELDS_REGISTRY[k].tab === tab,
  );
}

/** All registered fields for a given tab + section, in registry order. */
export function fieldsForSection(
  tab: DossierTab,
  section: string,
): InscriptionFieldKey[] {
  return ALL_INSCRIPTION_FIELD_KEYS.filter(
    (k) =>
      INSCRIPTION_FIELDS_REGISTRY[k].tab === tab &&
      INSCRIPTION_FIELDS_REGISTRY[k].section === section,
  );
}
