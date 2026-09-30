/**
 * Client-safe half of the messagerie: the audience spec shared by the
 * recipient picker (client), the send actions and the announcement board.
 * NO server imports here — the resolver lives in ./messaging.
 *
 * An audience is a UNION: a parent receives the message if ANY clause
 * matches. Group clauses (all / establishments / levels / classes) resolve
 * against the ACTIVE academic year's current enrollments; families and
 * individual parents are explicit picks.
 */
export type AudienceSpec = {
  all?: boolean;
  establishmentIds?: string[];
  levels?: string[];
  classIds?: string[];
  familyIds?: string[];
  parentUserIds?: string[];
};

export const MESSAGE_SUBJECT_MAX = 160;
export const MESSAGE_BODY_MAX = 10_000;
export const MESSAGE_MAX_ATTACHMENTS = 5;
export const MESSAGE_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

const ID_LIST_MAX = 500;

function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) {
    if (typeof x === "string" && x.trim() && x.length <= 200) out.add(x.trim());
    if (out.size >= ID_LIST_MAX) break;
  }
  return [...out];
}

/** Sanitize an untrusted audience blob (client payload or stored JSON). */
export function parseAudienceSpec(raw: unknown): AudienceSpec {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const spec: AudienceSpec = {};
  if (r.all === true) spec.all = true;
  const est = cleanList(r.establishmentIds);
  const lv = cleanList(r.levels);
  const cl = cleanList(r.classIds);
  const fam = cleanList(r.familyIds);
  const par = cleanList(r.parentUserIds);
  if (est.length) spec.establishmentIds = est;
  if (lv.length) spec.levels = lv;
  if (cl.length) spec.classIds = cl;
  if (fam.length) spec.familyIds = fam;
  if (par.length) spec.parentUserIds = par;
  return spec;
}

export function isEmptyAudience(spec: AudienceSpec): boolean {
  return (
    !spec.all &&
    !spec.establishmentIds?.length &&
    !spec.levels?.length &&
    !spec.classIds?.length &&
    !spec.familyIds?.length &&
    !spec.parentUserIds?.length
  );
}

/** Direct = only explicitly chosen parents/families (no group clause). The
 *  composer defaults "Autoriser les réponses" ON for direct, OFF for groups. */
export function isDirectAudience(spec: AudienceSpec): boolean {
  return (
    !spec.all &&
    !spec.establishmentIds?.length &&
    !spec.levels?.length &&
    !spec.classIds?.length &&
    (!!spec.familyIds?.length || !!spec.parentUserIds?.length)
  );
}

/** Recipient-picker option payloads (server → client). */
export type PickerEstablishment = { id: string; name: string };
export type PickerClass = { id: string; name: string; level: string };
export type PickerRecipient =
  | {
      kind: "parent";
      id: string;
      label: string;
      detail: string;
    }
  | {
      kind: "family";
      id: string;
      label: string;
      detail: string;
    };

export type AudiencePreview = {
  count: number;
  sample: string[];
};
