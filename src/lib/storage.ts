import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "documents";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Allowed upload MIME types — justificatifs are ID docs, photos, bulletins and
 * vaccination scans, so PDF + raster images only. Notably EXCLUDES text/html and
 * image/svg+xml, which can carry script and would otherwise render (stored XSS)
 * when an admin opens the signed URL. Downloads are additionally forced to
 * attachment (see getSignedDownloadUrl) as defense in depth.
 */
const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/bmp",
]);

let _client: SupabaseClient | null | undefined;

/**
 * Lazily build a Supabase client using the service-role key. Returns null when
 * storage isn't configured so callers can fall back to external URLs.
 */
function getClient(): SupabaseClient | null {
  if (_client !== undefined) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    _client = null;
    return null;
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function isStorageConfigured(): boolean {
  return getClient() !== null;
}

/**
 * Upload a File to Supabase Storage under {tenantId}/{kebab-safe-name}-{ts}.{ext}.
 * Returns the storage path (key) on success, or null when storage isn't wired.
 * Throws on actual upload failures so the action can surface a real error.
 */
export async function uploadDocument(
  tenantId: string,
  file: File,
): Promise<{ path: string; size: number; mimeType: string } | null> {
  const client = getClient();
  if (!client) return null;

  const mimeType = file.type || "";
  if (!ALLOWED_UPLOAD_TYPES.has(mimeType)) {
    throw new Error(
      `Type de fichier non autorisé${mimeType ? ` (${mimeType})` : ""}. Formats acceptés : PDF, JPG, PNG, WEBP, GIF, HEIC, TIFF.`,
    );
  }

  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  const path = `${tenantId}/${Date.now()}-${safeName || "file"}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(arrayBuffer), {
      contentType: mimeType,
      upsert: false,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return { path, size: file.size, mimeType };
}

/**
 * Generate a short-lived signed download URL for an object in the bucket.
 * Returns null if storage isn't wired (the caller can fall back to externalUrl).
 */
export async function getSignedDownloadUrl(storagePath: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client.storage
    .from(BUCKET)
    // download:true → Content-Disposition: attachment, so the browser saves the
    // file instead of rendering it inline (defuses HTML/SVG stored-XSS).
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, { download: true });
  if (error) return null;
  return data.signedUrl;
}

export async function deleteFromStorage(storagePath: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.storage.from(BUCKET).remove([storagePath]);
}
