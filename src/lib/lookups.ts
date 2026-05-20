/**
 * Built-in reference lists for preset dropdown field types.
 *
 * All labels are in French (the primary EduLM locale). Stored as flat string
 * arrays — the field-config renderer treats them the same way as a regular
 * `select` with options, so the form layer doesn't need special handling.
 *
 * Update notes:
 *  - Countries follow ISO 3166-1 (193 UN members + 2 observers + a few common
 *    territories).
 *  - Nationalities follow the standard French adjective form (masculine
 *    singular), sorted alphabetically.
 *  - Lebanese regions are the 26 cazas (districts), grouped roughly by
 *    governorate within the file for readability — the exported list is
 *    alphabetically sorted for the dropdown.
 */

// ─── Countries (FR) ───────────────────────────────────────────────────

export const COUNTRIES_FR: string[] = [
  "Afghanistan", "Afrique du Sud", "Albanie", "Algérie", "Allemagne", "Andorre",
  "Angola", "Antigua-et-Barbuda", "Arabie saoudite", "Argentine", "Arménie",
  "Australie", "Autriche", "Azerbaïdjan", "Bahamas", "Bahreïn", "Bangladesh",
  "Barbade", "Belgique", "Belize", "Bénin", "Bhoutan", "Biélorussie", "Birmanie (Myanmar)",
  "Bolivie", "Bosnie-Herzégovine", "Botswana", "Brésil", "Brunei", "Bulgarie",
  "Burkina Faso", "Burundi", "Cambodge", "Cameroun", "Canada", "Cap-Vert",
  "Centrafrique", "Chili", "Chine", "Chypre", "Colombie", "Comores", "Congo",
  "Congo (République démocratique)", "Corée du Nord", "Corée du Sud", "Costa Rica",
  "Côte d'Ivoire", "Croatie", "Cuba", "Danemark", "Djibouti", "Dominique",
  "Égypte", "El Salvador", "Émirats arabes unis", "Équateur", "Érythrée",
  "Espagne", "Estonie", "Eswatini", "États-Unis", "Éthiopie", "Fidji",
  "Finlande", "France", "Gabon", "Gambie", "Géorgie", "Ghana", "Grèce",
  "Grenade", "Guatemala", "Guinée", "Guinée-Bissau", "Guinée équatoriale",
  "Guyana", "Haïti", "Honduras", "Hongrie", "Île Maurice", "Îles Marshall",
  "Îles Salomon", "Inde", "Indonésie", "Irak", "Iran", "Irlande", "Islande",
  "Israël", "Italie", "Jamaïque", "Japon", "Jordanie", "Kazakhstan", "Kenya",
  "Kirghizistan", "Kiribati", "Kosovo", "Koweït", "Laos", "Lesotho", "Lettonie",
  "Liban", "Libéria", "Libye", "Liechtenstein", "Lituanie", "Luxembourg",
  "Macédoine du Nord", "Madagascar", "Malaisie", "Malawi", "Maldives", "Mali",
  "Malte", "Maroc", "Mauritanie", "Mexique", "Micronésie", "Moldavie", "Monaco",
  "Mongolie", "Monténégro", "Mozambique", "Namibie", "Nauru", "Népal",
  "Nicaragua", "Niger", "Nigéria", "Norvège", "Nouvelle-Zélande", "Oman",
  "Ouganda", "Ouzbékistan", "Pakistan", "Palaos", "Palestine", "Panama",
  "Papouasie-Nouvelle-Guinée", "Paraguay", "Pays-Bas", "Pérou", "Philippines",
  "Pologne", "Portugal", "Qatar", "République dominicaine", "République tchèque",
  "Roumanie", "Royaume-Uni", "Russie", "Rwanda", "Saint-Christophe-et-Niévès",
  "Sainte-Lucie", "Saint-Marin", "Saint-Vincent-et-les-Grenadines", "Salvador",
  "Samoa", "Sao Tomé-et-Principe", "Sénégal", "Serbie", "Seychelles",
  "Sierra Leone", "Singapour", "Slovaquie", "Slovénie", "Somalie", "Soudan",
  "Soudan du Sud", "Sri Lanka", "Suède", "Suisse", "Suriname", "Syrie",
  "Tadjikistan", "Tanzanie", "Tchad", "Thaïlande", "Timor oriental", "Togo",
  "Tonga", "Trinité-et-Tobago", "Tunisie", "Turkménistan", "Turquie", "Tuvalu",
  "Ukraine", "Uruguay", "Vanuatu", "Vatican", "Venezuela", "Vietnam", "Yémen",
  "Zambie", "Zimbabwe",
];

// ─── Nationalities (FR, adjective form) ───────────────────────────────

export const NATIONALITIES_FR: string[] = [
  "Afghane", "Albanaise", "Algérienne", "Allemande", "Américaine", "Andorrane",
  "Angolaise", "Antiguaise", "Argentine", "Arménienne", "Australienne",
  "Autrichienne", "Azerbaïdjanaise", "Bahamienne", "Bahreïnienne", "Bangladaise",
  "Barbadienne", "Belge", "Bélizienne", "Béninoise", "Bhoutanaise",
  "Biélorusse", "Birmane", "Bolivienne", "Bosnienne", "Botswanaise",
  "Brésilienne", "Britannique", "Brunéienne", "Bulgare", "Burkinabée", "Burundaise",
  "Cambodgienne", "Camerounaise", "Canadienne", "Cap-Verdienne", "Centrafricaine",
  "Chilienne", "Chinoise", "Chypriote", "Colombienne", "Comorienne", "Congolaise",
  "Coréenne", "Costaricaine", "Croate", "Cubaine", "Danoise", "Djiboutienne",
  "Dominicaine", "Dominiquaise", "Égyptienne", "Émirienne", "Équatorienne",
  "Érythréenne", "Espagnole", "Estonienne", "Eswatinienne", "Éthiopienne",
  "Fidjienne", "Finlandaise", "Française", "Gabonaise", "Gambienne", "Géorgienne",
  "Ghanéenne", "Grecque", "Grenadienne", "Guatémaltèque", "Guinéenne",
  "Guyanienne", "Haïtienne", "Hondurienne", "Hongroise", "Indienne", "Indonésienne",
  "Irakienne", "Iranienne", "Irlandaise", "Islandaise", "Israélienne", "Italienne",
  "Ivoirienne", "Jamaïcaine", "Japonaise", "Jordanienne", "Kazakhstanaise",
  "Kényane", "Kirghize", "Kiribatienne", "Kosovare", "Koweïtienne", "Laotienne",
  "Lesothane", "Lettonne", "Libanaise", "Libérienne", "Libyenne", "Liechtensteinoise",
  "Lituanienne", "Luxembourgeoise", "Macédonienne", "Malaisienne", "Malawienne",
  "Maldivienne", "Malgache", "Malienne", "Maltaise", "Marocaine", "Marshallaise",
  "Mauricienne", "Mauritanienne", "Mexicaine", "Micronésienne", "Moldave",
  "Monégasque", "Mongole", "Monténégrine", "Mozambicaine", "Namibienne",
  "Nauruane", "Néerlandaise", "Néo-Zélandaise", "Népalaise", "Nicaraguayenne",
  "Nigériane", "Nigérienne", "Nord-coréenne", "Norvégienne", "Omanaise",
  "Ougandaise", "Ouzbèke", "Pakistanaise", "Palaosienne", "Palestinienne",
  "Panaméenne", "Papouane", "Paraguayenne", "Péruvienne", "Philippine",
  "Polonaise", "Portugaise", "Qatarienne", "Roumaine", "Russe", "Rwandaise",
  "Saint-Lucienne", "Saint-Marinaise", "Salomonienne", "Salvadorienne", "Samoane",
  "Santoméenne", "Sénégalaise", "Serbe", "Seychelloise", "Sierra-léonaise",
  "Singapourienne", "Slovaque", "Slovène", "Somalienne", "Soudanaise",
  "Sri-Lankaise", "Sud-africaine", "Sud-coréenne", "Sud-soudanaise", "Suédoise",
  "Suisse", "Surinamaise", "Syrienne", "Tadjike", "Tanzanienne", "Tchadienne",
  "Tchèque", "Thaïlandaise", "Timoraise", "Togolaise", "Tonguienne",
  "Trinidadienne", "Tunisienne", "Turkmène", "Turque", "Tuvaluane", "Ukrainienne",
  "Uruguayenne", "Vanuatuane", "Vaticane", "Vénézuélienne", "Vietnamienne",
  "Yéménite", "Zambienne", "Zimbabwéenne",
];

// ─── Lebanese cazas (districts), sorted alphabetically ───────────────

export const LEBANON_REGIONS_FR: string[] = [
  "Aakkar", "Aley", "Baabda", "Baalbek", "Batroun", "Becharré", "Beyrouth",
  "Békaa-Ouest", "Bint Jbeil", "Chouf", "Hasbaya", "Hermel", "Jbeil (Byblos)",
  "Jezzine", "Kesrouan", "Koura", "Marjeyoun", "Matn", "Minieh-Danniyé",
  "Nabatieh", "Rachaya", "Saïda", "Sour (Tyr)", "Tripoli", "Zahlé", "Zgharta",
];

// ─── Lebanese towns/villages by caza ─────────────────────────────────
// Curated lists per caza, focused on populated towns likely to appear in a
// Lebanese school's catchment area. Denser coverage for Beirut + Mount
// Lebanon since most school families are concentrated there. Not exhaustive
// — admins can ask for additions if a family's town is missing.

export const LEBANON_TOWNS_BY_KAZA: Record<string, string[]> = {
  "Beyrouth": [
    "Achrafieh", "Badaro", "Bachoura", "Basta", "Centre-ville", "Furn el Chebbak",
    "Gemmayze", "Hamra", "Mar Mikhael", "Mazraa", "Mazraa el Arab",
    "Minet el Hosn", "Mousseitbé", "Port", "Ras Beyrouth", "Rmeil",
    "Saïfi", "Sodeco", "Tarik Jdideh", "Verdun", "Zarif", "Zoukak el Blat",
  ],
  "Aakkar": [
    "Halba", "Bebnine", "Cheikh Mohammad", "Fnaideq", "Halba Aakkar",
    "Massoudieh", "Michmich", "Rahbé", "Sahel Aakkar", "Tikrit",
  ],
  "Aley": [
    "Aïnab", "Aley", "Bchamoun", "Bdadoun", "Bhamdoun", "Btater",
    "Choueifat", "Kahaleh", "Kayfoun", "Mansouriyeh el Maten",
    "Ouadi Chahrour", "Ramlieh", "Sofar", "Souk el Gharb",
  ],
  "Baabda": [
    "Baabda", "Borj el Brajneh", "Chiyah", "Choueifat (Aamroussiyé)",
    "Damour", "Hadath", "Haret Hreik", "Hazmieh", "Jamhour", "Kfarchima",
    "Khaldeh", "Ouadi Chahrour", "Wadi Chahrour", "Yarzé",
  ],
  "Baalbek": [
    "Baalbek", "Brital", "Britel", "Deir el Ahmar", "Iaat", "Labwé",
    "Nabi Chit", "Ras Baalbek", "Younine",
  ],
  "Batroun": [
    "Aabrine", "Batroun", "Bcharré (route)", "Hamat", "Kobayat",
    "Koubba", "Selaata", "Smar Jbeil", "Tannourine",
  ],
  "Becharré": [
    "Becharré", "Bazaoun", "Bkaakafra", "Bqaa Kafra", "Hadath el Jebbé",
    "Hadchit", "Hasroun", "Tourza",
  ],
  "Békaa-Ouest": [
    "Aïn Zebdé", "Joub Jannine", "Kefraya", "Kherbet Kanafar",
    "Machghara", "Saghbine", "Sohmor",
  ],
  "Bint Jbeil": [
    "Aïnata", "Aïta el Chaab", "Bint Jbeil", "Maroun el Ras", "Tibnine",
    "Yaroun", "Yater",
  ],
  "Chouf": [
    "Aanout", "Baakline", "Barouk", "Beit ed-Dine", "Brih", "Chhim",
    "Deir el Qamar", "Joun", "Kfarhim", "Mokhtara", "Moukhtara",
    "Niha", "Semqaniyé",
  ],
  "Hasbaya": [
    "Chebaa", "Hasbaya", "Kfarchouba", "Marj el Zouhour", "Rachaya el Foukhar",
  ],
  "Hermel": [
    "Hermel", "Kasr", "Qaa", "Zighrine",
  ],
  "Jbeil (Byblos)": [
    "Aamchit", "Annaya", "Aqoura", "Berbara", "Blat", "Byblos (Jbeil)",
    "Edde", "Ghazir (Kesrouan, voisin)", "Gherfine", "Hboub",
    "Lehfed", "Mastita", "Mechmech", "Tartej",
  ],
  "Jezzine": [
    "Aazour", "Bkassine", "Botmé", "Jezzine", "Lebaa", "Mlikh",
    "Rihan", "Sfaray", "Wadi Jezzine",
  ],
  "Kesrouan": [
    "Aajaltoun", "Adma", "Aïntoura", "Aïn el Rihané", "Antélias (limite)",
    "Bekfaya (limite)", "Bouar", "Cornet Chehouane (limite)", "Daraoun",
    "Dbayé", "Dbayeh", "Faraya", "Faytroun", "Fidar", "Ghazir",
    "Ghazzir", "Ghosta", "Hrajel", "Jeita", "Jouret el Ballout",
    "Kfardebian", "Kfarhbab", "Kléiat", "Mayrouba", "Mzaar Kfardebian",
    "Nahr el Kalb", "Okaibé", "Sahel Alma", "Tabarja", "Yarzé (limite)",
    "Zouk Mikael", "Zouk Mosbeh",
  ],
  "Koura": [
    "Amioun", "Anfeh", "Batroumine", "Bdebba", "Bterram", "Enfeh",
    "Fih", "Kefraya", "Kfaraakka", "Kousba", "Ras Maska",
  ],
  "Marjeyoun": [
    "Arnoun", "Blat", "Borj el Mlouk", "Deir Mimas", "Klayaa",
    "Marjeyoun", "Qlayaa",
  ],
  "Matn": [
    "Antélias", "Aoukar", "Baabdat", "Baouchriyeh", "Beit Chabab",
    "Beit el Kikko", "Beit Mery", "Bekfaya", "Borj Hammoud",
    "Broumana", "Bsalim", "Bteghrine", "Dahr el Souane", "Daychounié",
    "Dbayé (limite)", "Dik el Mehdi", "Dora", "Fanar", "Jal el Dib",
    "Jdeideh", "Khenchara", "Mansourieh el Matn", "Mar Roukoz",
    "Mazraat Yachouh", "Mkalles", "Mtayleb", "Naccache", "Qornet Chehwan",
    "Rabieh", "Roumieh", "Sad el Bauchrieh", "Sin el Fil", "Zalka",
  ],
  "Minieh-Danniyé": [
    "Berqayel", "Bhanine", "Deir Ammar", "Kfarhabou", "Minieh", "Sir el Danniyé",
  ],
  "Nabatieh": [
    "Ansar", "Doueir", "Kfarroumane", "Kfartebnit", "Nabatieh",
    "Nabatieh el Faouqa", "Yohmor", "Zaoutar el Charkiyé",
    "Zaoutar el Gharbiyé",
  ],
  "Rachaya": [
    "Aïta el Foukhar", "Deir el Aachayer", "Kfar Mechki", "Rachaya el Wadi",
  ],
  "Saïda": [
    "Aïn el Delb", "Bramieh", "Ghazieh", "Haret Saïda", "Magdouché",
    "Mieh Mieh", "Saïda", "Sarafand", "Zrarié",
  ],
  "Sour (Tyr)": [
    "Aabbassieh", "Abbasieh", "Bourj el Chemali", "Chamaa", "Deir Kifa",
    "Maaroub", "Naqoura", "Qana", "Rmadiyé", "Sour (Tyr)",
  ],
  "Tripoli": [
    "Abou Samra", "El Mina", "Kobbe", "Qalamoun", "Tripoli centre",
    "Zahriyeh",
  ],
  "Zahlé": [
    "Aanjar", "Ablah", "Bouarej", "Chtaura", "Ferzol", "Kab Elias",
    "Karak", "Kfarzabad", "Niha (Zahlé)", "Qaa el Rim", "Riyaq",
    "Saadnayel", "Taanayel", "Taalabaya", "Terbol", "Zahlé",
  ],
  "Zgharta": [
    "Aitou", "Ardé", "Bnachii", "Ehden", "Karam", "Kfar Yachit",
    "Mezyara", "Miryata", "Sebhel", "Toula", "Zgharta",
  ],
};

// ─── Resolver ─────────────────────────────────────────────────────────

/**
 * For a given preset field type, return its option list. Returns null for
 * non-preset types (the caller falls back to the field's manually-defined
 * `options` array).
 */
export function presetOptionsForType(type: string): string[] | null {
  switch (type) {
    case "country":
      return COUNTRIES_FR;
    case "nationality":
      return NATIONALITIES_FR;
    case "lebanon_region":
      return LEBANON_REGIONS_FR;
    default:
      return null;
  }
}
