/**
 * The canonical Dars-aligned field set for Lycée Montaigne.
 *
 * Drives BOTH the seed (installs these into Tenant.parent/studentFieldsConfig)
 * AND the importer (writes each Dars value to the matching key). `key` is the
 * stable id — customAnswers is keyed by it, so the importer just does
 * customAnswers[key] = value.
 *
 * binding (canonical mirror) vs codeType (Dars Isc_Codes dropdown options)
 * vs plain (free input). Bound fields render read-only (value flows from the
 * canonical column); everything else is editable via the normal forms.
 */

export type SeedField = {
  key: string;
  label: string;
  type:
    | "short_text"
    | "long_text"
    | "yes_no"
    | "select"
    | "date"
    | "phone"
    | "email"
    | "number"
    | "establishment_ref"
    | "niveau_for_establishment";
  category: string;
  /** For niveau_for_establishment: the key of the source establishment field. */
  optionsSourceKey?: string;
  userBoundTo?: "firstName" | "lastName" | "name" | "email";
  guardianBoundTo?:
    | "phone"
    | "nationality1"
    | "nationality2"
    | "isLebanese"
    | "passportLebanese"
    | "relation";
  familyBoundTo?:
    | "addressStreet"
    | "addressHood"
    | "addressCity"
    | "addressCountry"
    | "imageRightsSite"
    | "imageRightsBook"
    | "imageRightsSocial"
    | "imageRightsRadio";
  dossierBoundTo?:
    | "childFirstName"
    | "childLastName"
    | "childDob"
    | "establishment"
    | "niveau"
    | "childPassportLebanese";
  /** Seed dropdown options from this Dars Isc_Codes CodeType. */
  codeType?: string;
  /** Explicit dropdown options (when not from Isc_Codes). */
  options?: string[];
};

export const PARENT_CATEGORIES = [
  "Info générale",
  "Contact",
  "Professionnel",
  "Adresse",
  "Info Arabe",
];

export const PARENT_FIELDS: SeedField[] = [
  // ── Info générale ──
  { key: "prenom", label: "Prénom", type: "short_text", category: "Info générale", userBoundTo: "firstName" },
  { key: "nom", label: "Nom", type: "short_text", category: "Info générale", userBoundTo: "lastName" },
  { key: "situation_famille", label: "Situation", type: "select", category: "Info générale", codeType: "SIT" },
  { key: "decede", label: "Décédé(e)", type: "yes_no", category: "Info générale" },
  { key: "second_mariage", label: "Second mariage", type: "yes_no", category: "Info générale" },
  { key: "ancien_eleve", label: "Ancien(ne) élève", type: "yes_no", category: "Info générale" },
  { key: "numero_registre", label: "Registre", type: "short_text", category: "Info générale" },
  { key: "nationalite1", label: "Nationalité 1", type: "select", category: "Info générale", guardianBoundTo: "nationality1", codeType: "NAT" },
  { key: "nationalite2", label: "Nationalité 2", type: "select", category: "Info générale", guardianBoundTo: "nationality2", codeType: "NAT" },
  { key: "communaute", label: "Communauté", type: "select", category: "Info générale", codeType: "REL" },
  { key: "type_famille", label: "Type famille", type: "select", category: "Info générale", options: ["Ordinaire", "Parents Cadrés", "Parents Empl", "Parents Non-cadrés", "Parents boursiers"] },
  { key: "auth_site", label: "Autorisation Site Internet", type: "yes_no", category: "Info générale", familyBoundTo: "imageRightsSite" },
  { key: "auth_livre", label: "Autorisation Livre Souvenir", type: "yes_no", category: "Info générale", familyBoundTo: "imageRightsBook" },
  { key: "auth_reseaux", label: "Autorisation Réseaux Sociaux", type: "yes_no", category: "Info générale", familyBoundTo: "imageRightsSocial" },
  { key: "auth_radio", label: "Autorisation Web Radio", type: "yes_no", category: "Info générale", familyBoundTo: "imageRightsRadio" },

  // ── Contact ──
  { key: "email", label: "Email", type: "email", category: "Contact", userBoundTo: "email" },
  { key: "portable", label: "Portable", type: "phone", category: "Contact", guardianBoundTo: "phone" },
  { key: "telephones", label: "Téléphones (liste)", type: "long_text", category: "Contact" },

  // ── Professionnel ──
  { key: "statut_travail", label: "Statut de travail", type: "select", category: "Professionnel", codeType: "WS" },
  { key: "secteur_activite", label: "Secteur d'activités", type: "short_text", category: "Professionnel" },
  { key: "profession", label: "Profession", type: "select", category: "Professionnel", codeType: "PRO2" },
  { key: "profession_detail", label: "Détail profession", type: "short_text", category: "Professionnel" },
  { key: "position", label: "Position", type: "short_text", category: "Professionnel" },
  { key: "societe", label: "Société", type: "short_text", category: "Professionnel" },
  { key: "adresse_travail", label: "Adresse du travail", type: "short_text", category: "Professionnel" },

  // ── Adresse (household / Family) ──
  { key: "adresse_rue", label: "Rue", type: "short_text", category: "Adresse", familyBoundTo: "addressStreet" },
  { key: "adresse_immeuble", label: "Immeuble", type: "short_text", category: "Adresse" },
  { key: "adresse_etage", label: "Étage", type: "short_text", category: "Adresse" },
  { key: "adresse_qaza", label: "Qaza", type: "short_text", category: "Adresse" },
  { key: "adresse_village", label: "Village", type: "short_text", category: "Adresse", familyBoundTo: "addressCity" },
  { key: "adresse_place", label: "Place details", type: "short_text", category: "Adresse", familyBoundTo: "addressHood" },
  { key: "adresse_bp", label: "Boîte postale", type: "short_text", category: "Adresse" },
  { key: "adresse_remarque", label: "Remarque", type: "long_text", category: "Adresse" },

  // ── Info Arabe ──
  { key: "nom_ar", label: "الشهرة (Nom AR)", type: "short_text", category: "Info Arabe" },
  { key: "prenom_ar", label: "الاسم (Prénom AR)", type: "short_text", category: "Info Arabe" },
  { key: "nom_pere_ar", label: "اسم الأب (Nom du père AR)", type: "short_text", category: "Info Arabe" },
  { key: "lieu_registre", label: "مكان القيد (Lieu du registre)", type: "short_text", category: "Info Arabe" },
  { key: "caza_registre", label: "قضاء القيد (Caza du registre)", type: "short_text", category: "Info Arabe" },
  { key: "adresse_rue_ar", label: "الشارع (Rue AR)", type: "short_text", category: "Info Arabe" },
  { key: "adresse_immeuble_ar", label: "المبنى (Immeuble AR)", type: "short_text", category: "Info Arabe" },
  { key: "adresse_place_ar", label: "تفاصيل (Place AR)", type: "short_text", category: "Info Arabe" },
];

export const STUDENT_CATEGORIES = [
  "Info générale",
  "Scolarité",
  "Services",
  "Autorisations",
  "Info Arabe",
];

export const STUDENT_FIELDS: SeedField[] = [
  // ── Info générale ──
  { key: "prenom", label: "Prénom", type: "short_text", category: "Info générale", dossierBoundTo: "childFirstName" },
  { key: "nom", label: "Nom", type: "short_text", category: "Info générale", dossierBoundTo: "childLastName" },
  { key: "dars_student_code", label: "Code", type: "short_text", category: "Info générale" },
  { key: "date_naissance", label: "Date de naissance", type: "date", category: "Info générale", dossierBoundTo: "childDob" },
  { key: "pays_naissance", label: "Pays de naissance", type: "short_text", category: "Info générale" },
  { key: "lieu_naissance", label: "Lieu de naissance", type: "short_text", category: "Info générale" },
  { key: "nationalite", label: "Nationalité 1", type: "select", category: "Info générale", codeType: "NAT" },
  { key: "nationalite2", label: "Nationalité 2", type: "select", category: "Info générale", codeType: "NAT" },
  { key: "communaute_eleve", label: "Communauté", type: "select", category: "Info générale", codeType: "REL" },
  { key: "numero_identite", label: "N° d'identité", type: "short_text", category: "Info générale" },
  { key: "email_eleve", label: "Email", type: "email", category: "Info générale" },
  { key: "email_college", label: "Email au collège", type: "email", category: "Info générale" },
  { key: "portable_eleve", label: "Portable", type: "phone", category: "Info générale" },

  // ── Scolarité ── (Établissement/Niveau are the structural inscription
  //   pickers, mirrored from the dossier — keep them so the inscription
  //   flow's cascading selection still works.)
  { key: "etablissement", label: "Établissement", type: "establishment_ref", category: "Scolarité", dossierBoundTo: "establishment" },
  { key: "niveau", label: "Niveau", type: "niveau_for_establishment", category: "Scolarité", dossierBoundTo: "niveau", optionsSourceKey: "etablissement" },
  { key: "date_inscription", label: "Date d'inscription", type: "date", category: "Scolarité" },
  { key: "date_entree", label: "Date d'entrée", type: "date", category: "Scolarité" },
  { key: "a_quitte", label: "A quitté", type: "yes_no", category: "Scolarité" },
  { key: "raison_depart", label: "Raison du départ", type: "short_text", category: "Scolarité" },
  { key: "raison_depart_detail", label: "Raison détaillée du départ", type: "long_text", category: "Scolarité" },
  { key: "date_depart", label: "Date de départ", type: "date", category: "Scolarité" },

  // ── Services ──
  { key: "collations", label: "Collations", type: "yes_no", category: "Services" },
  { key: "repas_chaud", label: "Repas chaud", type: "yes_no", category: "Services" },
  { key: "autocar", label: "Autocar (aller-retour)", type: "yes_no", category: "Services" },
  { key: "autocar_details", label: "Autocar — détails", type: "long_text", category: "Services" },

  // ── Autorisations ──
  { key: "quitter_seul", label: "Autorisé à quitter seul", type: "yes_no", category: "Autorisations" },
  { key: "auth_site", label: "Autorisation Site Internet", type: "yes_no", category: "Autorisations" },
  { key: "auth_livre", label: "Autorisation Livre Souvenir", type: "yes_no", category: "Autorisations" },
  { key: "auth_reseaux", label: "Autorisation Réseaux Sociaux", type: "yes_no", category: "Autorisations" },
  { key: "auth_radio", label: "Autorisation Web Radio", type: "yes_no", category: "Autorisations" },

  // ── Info Arabe ──
  { key: "nom_prenom_ar", label: "الاسم الكامل (Nom Prénom AR)", type: "short_text", category: "Info Arabe" },
  { key: "lieu_naissance_ar", label: "مكان الولادة (Lieu naissance AR)", type: "short_text", category: "Info Arabe" },
];
