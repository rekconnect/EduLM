"use client";

import { useState, useTransition } from "react";
import {
  Pencil,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Syringe,
  Stethoscope,
  HeartPulse,
} from "lucide-react";
import { toast } from "sonner";
import { Input, Select, Textarea } from "@/components/ui/input";

/**
 * "Santé" tab on the student fiche: medical record (pencil-editable),
 * immunizations table and infirmary-visit history. Sensitive — the page only
 * renders this for SCHOOL_ADMIN.
 */

export type MedicalRecordData = {
  bloodType: string;
  diabetic: boolean;
  asthma: boolean;
  epilepsy: boolean;
  scoliosis: boolean;
  favism: boolean;
  hemophilia: boolean;
  cardiacProblem: boolean;
  allergies: string;
  medications: string;
  hospitalization: string;
  surgeries: string;
  majorIllnesses: string;
  chronicIllness: string;
  familyHistory: string;
  specialNeeds: string;
  remarks: string;
  pediatricianName: string;
  pediatricianPhone: string;
  allowEmergencyMeasures: boolean | null;
  allowDoctorExam: boolean | null;
  allowParacetamol: boolean | null;
  allowMedicalTreatment: boolean | null;
  unfitForSports: boolean;
  unfitDuration: string;
  unfitReason: string;
};

export type ImmunizationData = {
  id: string;
  vaccine: string;
  done: boolean;
  month: number | null;
  year: number | null;
  notes: string;
};

export type VisitData = {
  id: string;
  date: string; // yyyy-mm-dd
  yearLabel: string;
  heightCm: number | null;
  weightKg: number | null;
  bp: string;
  visionOd: string;
  visionOg: string;
  exam: string;
  plan: string;
  followUp: string;
  remarks: string;
  details: Array<[string, string]>;
};

const CONDITIONS: Array<[keyof MedicalRecordData & string, string]> = [
  ["asthma", "Asthme"],
  ["diabetic", "Diabète"],
  ["epilepsy", "Épilepsie"],
  ["cardiacProblem", "Problème cardiaque"],
  ["scoliosis", "Scoliose"],
  ["favism", "Favisme"],
  ["hemophilia", "Hémophilie"],
];
const TEXTS: Array<[keyof MedicalRecordData & string, string, boolean]> = [
  // key, label, long
  ["allergies", "Allergies", true],
  ["medications", "Médicaments", true],
  ["chronicIllness", "Maladie chronique", true],
  ["majorIllnesses", "Antécédents médicaux", true],
  ["surgeries", "Antécédents chirurgicaux", true],
  ["hospitalization", "Hospitalisations", true],
  ["familyHistory", "Antécédents familiaux", true],
  ["specialNeeds", "Besoins particuliers", true],
  ["remarks", "Remarques", true],
];
const CONSENTS: Array<[keyof MedicalRecordData & string, string]> = [
  ["allowEmergencyMeasures", "Mesures d'urgence autorisées"],
  ["allowDoctorExam", "Examen par le médecin autorisé"],
  ["allowParacetamol", "Paracétamol autorisé"],
  ["allowMedicalTreatment", "Traitement médical autorisé"],
];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const MONTHS = ["", "janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const ynLabel = (v: boolean | null) => (v === true ? "Oui" : v === false ? "Non" : "—");

function Chip({ label, tone }: { label: string; tone: "danger" | "warn" }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium " +
        (tone === "danger"
          ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400")
      }
    >
      <AlertTriangle className="size-3" aria-hidden />
      {label}
    </span>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h4 className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
      {icon}
      {children}
    </h4>
  );
}

export function MedicalSection({
  record,
  immunizations,
  visits,
  onSave,
}: {
  record: MedicalRecordData;
  immunizations: ImmunizationData[];
  visits: VisitData[];
  onSave?: (values: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const toForm = (): Record<string, string> => {
    const f: Record<string, string> = {};
    for (const [k] of CONDITIONS) f[k] = record[k] ? "yes" : "no";
    for (const [k] of TEXTS) f[k] = String(record[k] ?? "");
    for (const [k] of CONSENTS) {
      const v = record[k] as boolean | null;
      f[k] = v === true ? "yes" : v === false ? "no" : "";
    }
    f.bloodType = record.bloodType;
    f.pediatricianName = record.pediatricianName;
    f.pediatricianPhone = record.pediatricianPhone;
    f.unfitForSports = record.unfitForSports ? "yes" : "no";
    f.unfitDuration = record.unfitDuration;
    f.unfitReason = record.unfitReason;
    return f;
  };
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(toForm);
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function save() {
    if (!onSave) return;
    start(async () => {
      const r = await onSave(form);
      if (r.ok) {
        toast.success("Enregistré");
        setEditing(false);
      } else {
        toast.error("Échec de l'enregistrement");
      }
    });
  }

  const activeConditions = CONDITIONS.filter(([k]) => record[k]).map(([, l]) => l);
  const doneImms = immunizations.filter((i) => i.done);

  return (
    <div className="space-y-8">
      {/* ── Dossier médical ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={<HeartPulse className="size-3.5" aria-hidden />}>
            Dossier médical
          </SectionTitle>
          {onSave ? (
            editing ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setForm(toForm());
                    setEditing(false);
                  }}
                  disabled={pending}
                  aria-label="Annuler"
                  className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="inline-flex h-6 items-center gap-1 rounded bg-[color:var(--color-brand-600)] px-2 text-xs font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-60"
                >
                  {pending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setForm(toForm());
                  setEditing(true);
                }}
                aria-label="Modifier le dossier médical"
                className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
              >
                <Pencil className="size-3" aria-hidden />
              </button>
            )
          ) : null}
        </div>

        {editing ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-xs text-[color:var(--color-foreground-muted)]">Groupe sanguin</span>
                <Select value={form.bloodType ?? ""} onChange={(e) => set("bloodType", e.target.value)}>
                  <option value="">—</option>
                  {BLOOD.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[color:var(--color-foreground-muted)]">Pédiatre</span>
                <Input value={form.pediatricianName ?? ""} onChange={(e) => set("pediatricianName", e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[color:var(--color-foreground-muted)]">Tél. pédiatre</span>
                <Input value={form.pediatricianPhone ?? ""} onChange={(e) => set("pediatricianPhone", e.target.value)} />
              </label>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs text-[color:var(--color-foreground-muted)]">Conditions chroniques</span>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {CONDITIONS.map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5 text-sm text-[color:var(--color-foreground)]">
                    <input
                      type="checkbox"
                      checked={form[k] === "yes"}
                      onChange={(e) => set(k, e.target.checked ? "yes" : "no")}
                      className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TEXTS.map(([k, label]) => (
                <label key={k} className="block space-y-1">
                  <span className="text-xs text-[color:var(--color-foreground-muted)]">{label}</span>
                  <Textarea rows={2} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {CONSENTS.map(([k, label]) => (
                <label key={k} className="block space-y-1">
                  <span className="text-xs text-[color:var(--color-foreground-muted)]">{label}</span>
                  <Select value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
                    <option value="">—</option>
                    <option value="yes">Oui</option>
                    <option value="no">Non</option>
                  </Select>
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-xs text-[color:var(--color-foreground-muted)]">Inapte au sport</span>
                <Select value={form.unfitForSports ?? "no"} onChange={(e) => set("unfitForSports", e.target.value)}>
                  <option value="no">Non</option>
                  <option value="yes">Oui</option>
                </Select>
              </label>
              {form.unfitForSports === "yes" ? (
                <>
                  <label className="block space-y-1">
                    <span className="text-xs text-[color:var(--color-foreground-muted)]">Durée</span>
                    <Input value={form.unfitDuration ?? ""} onChange={(e) => set("unfitDuration", e.target.value)} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-[color:var(--color-foreground-muted)]">Raison</span>
                    <Input value={form.unfitReason ?? ""} onChange={(e) => set("unfitReason", e.target.value)} />
                  </label>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Alert chips — the things the infirmary must see at a glance. */}
            {(record.allergies || activeConditions.length > 0 || record.unfitForSports) && (
              <div className="flex flex-wrap gap-1.5">
                {record.allergies ? <Chip tone="danger" label={`Allergies : ${record.allergies}`} /> : null}
                {activeConditions.map((c) => (
                  <Chip key={c} tone="warn" label={c} />
                ))}
                {record.unfitForSports ? (
                  <Chip tone="warn" label={`Inapte au sport${record.unfitReason ? ` (${record.unfitReason})` : ""}`} />
                ) : null}
              </div>
            )}
            <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {record.bloodType ? (
                <div>
                  <dt className="text-xs text-[color:var(--color-foreground-muted)]">Groupe sanguin</dt>
                  <dd className="text-sm font-medium text-[color:var(--color-foreground)]">{record.bloodType}</dd>
                </div>
              ) : null}
              {(record.pediatricianName || record.pediatricianPhone) ? (
                <div>
                  <dt className="text-xs text-[color:var(--color-foreground-muted)]">Pédiatre</dt>
                  <dd className="text-sm font-medium text-[color:var(--color-foreground)]">
                    {[record.pediatricianName, record.pediatricianPhone].filter(Boolean).join(" · ")}
                  </dd>
                </div>
              ) : null}
              {TEXTS.filter(([k]) => k !== "allergies" && String(record[k] ?? "").trim()).map(([k, label]) => (
                <div key={k} className="sm:col-span-2">
                  <dt className="text-xs text-[color:var(--color-foreground-muted)]">{label}</dt>
                  <dd className="text-sm text-[color:var(--color-foreground)]">{String(record[k])}</dd>
                </div>
              ))}
            </dl>
            <div>
              <span className="text-xs text-[color:var(--color-foreground-muted)]">Consentements : </span>
              <span className="text-sm text-[color:var(--color-foreground)]">
                {CONSENTS.map(([k, label]) => `${label.replace(" autorisées", "").replace(" autorisé", "")} ${ynLabel(record[k] as boolean | null)}`).join(" · ")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Vaccinations ── */}
      <div className="space-y-3">
        <SectionTitle icon={<Syringe className="size-3.5" aria-hidden />}>
          Vaccinations · {doneImms.length} faites / {immunizations.length}
        </SectionTitle>
        {immunizations.length === 0 ? (
          <p className="text-sm text-[color:var(--color-foreground-subtle)]">Aucune vaccination enregistrée.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border-subtle)]">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                  <th className="px-3 py-1.5 text-start font-semibold">Vaccin</th>
                  <th className="px-3 py-1.5 text-center font-semibold">Fait</th>
                  <th className="px-3 py-1.5 text-start font-semibold">Date</th>
                  <th className="px-3 py-1.5 text-start font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {immunizations.map((i) => (
                  <tr key={i.id} className="border-b border-[color:var(--color-border-subtle)] last:border-0">
                    <td className="px-3 py-1.5 font-medium text-[color:var(--color-foreground)]">{i.vaccine}</td>
                    <td className="px-3 py-1.5 text-center">
                      {i.done ? (
                        <Check className="mx-auto size-4 text-[color:var(--color-brand-600)]" aria-label="Oui" />
                      ) : (
                        <span className="text-[color:var(--color-foreground-subtle)]">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[color:var(--color-foreground-muted)]">
                      {i.year ? `${i.month ? MONTHS[i.month] + " " : ""}${i.year}` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-[color:var(--color-foreground-muted)]">{i.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Visites infirmerie ── */}
      <div className="space-y-3">
        <SectionTitle icon={<Stethoscope className="size-3.5" aria-hidden />}>
          Visites & bilans · {visits.length}
        </SectionTitle>
        {visits.length === 0 ? (
          <p className="text-sm text-[color:var(--color-foreground-subtle)]">Aucune visite enregistrée.</p>
        ) : (
          <ul className="space-y-2">
            {visits.map((v) => (
              <li
                key={v.id}
                className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-[color:var(--color-foreground)]">{v.date}</span>
                  {v.yearLabel ? (
                    <span className="text-xs text-[color:var(--color-foreground-subtle)]">{v.yearLabel}</span>
                  ) : null}
                  <span className="text-xs text-[color:var(--color-foreground-muted)]">
                    {[
                      v.heightCm ? `${v.heightCm} cm` : "",
                      v.weightKg ? `${v.weightKg} kg` : "",
                      v.bp ? `TA ${v.bp}` : "",
                      v.visionOd || v.visionOg ? `OD ${v.visionOd || "—"} / OG ${v.visionOg || "—"}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {(v.exam || v.plan || v.followUp || v.remarks) ? (
                  <p className="mt-1 text-sm text-[color:var(--color-foreground)]">
                    {[v.exam, v.plan, v.followUp, v.remarks].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {v.details.length > 0 ? (
                  <p className="mt-1 text-xs text-[color:var(--color-foreground-muted)]">
                    {v.details.map(([k, val]) => `${k}: ${val}`).join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
