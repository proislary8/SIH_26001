/**
 * Field Photo Upload API
 * POST /api/upload
 * Accepts: multipart/form-data { file, type, zone_id?, lat?, lng? }
 *
 * Upload strategy (in priority order):
 *   1. Cloudflare R2  (if env vars configured — production)
 *   2. Supabase Storage (fallback — always available)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const R2_ENDPOINT     = process.env.CLOUDFLARE_R2_ENDPOINT;
const R2_ACCESS_KEY   = process.env.CLOUDFLARE_R2_ACCESS_KEY;
const R2_SECRET_KEY   = process.env.CLOUDFLARE_R2_SECRET_KEY;
const R2_BUCKET       = process.env.CLOUDFLARE_R2_BUCKET ?? "landguard-ner";
const R2_PUBLIC_URL   = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

const isR2Configured = !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY);

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_SIZE_MB   = 10;

// ── Upload to Cloudflare R2 via S3-compatible API ──────────────────────────
async function uploadToR2(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  // Dynamic import — only needed server-side
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    region:   "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId:     R2_ACCESS_KEY!,
      secretAccessKey: R2_SECRET_KEY!,
    },
  });

  await client.send(new PutObjectCommand({
    Bucket:      R2_BUCKET,
    Key:         filename,
    Body:        buffer,
    ContentType: contentType,
    // R2 files are public if bucket is set to public
  }));

  const publicBase = R2_PUBLIC_URL ?? `${R2_ENDPOINT}/${R2_BUCKET}`;
  return `${publicBase}/${filename}`;
}

// ── Upload to Supabase Storage (fallback) ─────────────────────────────────
async function uploadToSupabase(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from("field-reports")
    .upload(filename, buffer, { contentType, upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage
    .from("field-reports")
    .getPublicUrl(filename);

  return data.publicUrl;
}

// ── Main handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const formData   = await req.formData();
    const file       = formData.get("file") as File | null;
    const type       = (formData.get("type") as string) || "field_report";
    const zoneIdRaw  = formData.get("zone_id") as string | null;
    const lat        = formData.get("lat") as string | null;
    const lng        = formData.get("lng") as string | null;
    // Join key so submit_field_report() can adopt this photo once the
    // report itself arrives — which may be much later, from the queue.
    const clientUuid = formData.get("client_uuid") as string | null;

    // zone_id is a UUID column; the report form used to send the literal
    // string "z1" from the old hardcoded map, which would fail the insert.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const zoneId = zoneIdRaw && UUID_RE.test(zoneIdRaw) ? zoneIdRaw : null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed. Accepted: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `File too large. Max size: ${MAX_SIZE_MB}MB` },
        { status: 400 },
      );
    }

    const buffer    = Buffer.from(await file.arrayBuffer());
    const ext       = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const timestamp = Date.now();
    const filename  = `${type}/${zoneId ?? "general"}/${timestamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    let publicUrl: string;
    let storageBackend: "cloudflare_r2" | "supabase_storage";

    if (isR2Configured) {
      publicUrl      = await uploadToR2(buffer, filename, file.type);
      storageBackend = "cloudflare_r2";
    } else {
      publicUrl      = await uploadToSupabase(buffer, filename, file.type);
      storageBackend = "supabase_storage";
    }

    // Record the metadata. The upload itself has already succeeded, so a
    // failure here must not fail the request — but it is logged rather
    // than swallowed, which is how this went unnoticed before: the
    // field_report_photos table did not exist and every insert was
    // discarded by an empty catch block.
    let metadataSaved = false;
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("field_report_photos").insert({
        client_uuid:     clientUuid,
        filename,
        public_url:      publicUrl,
        storage_backend: storageBackend,
        report_type:     type,
        zone_id:         zoneId,
        lat:             lat ? parseFloat(lat) : null,
        lng:             lng ? parseFloat(lng) : null,
        file_size_bytes: file.size,
        mime_type:       file.type,
        captured_at:     new Date().toISOString(),
      });
      if (error) {
        console.error("[upload] photo metadata insert failed:", error.message);
      } else {
        metadataSaved = true;
      }
    } catch (e) {
      console.error("[upload] photo metadata insert threw:", e);
    }

    return NextResponse.json({
      url:      publicUrl,
      backend:  storageBackend,
      filename,
      metadataSaved,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


