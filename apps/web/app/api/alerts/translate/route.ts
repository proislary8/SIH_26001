import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { translateAlert, TARGET_LANGUAGES } from "@/lib/ai/translate";
import { availableModels, defaultModel, configuredProviders } from "@/lib/ai/provider";

/**
 * POST /api/alerts/translate
 *
 * Returns translation DRAFTS for the alert composer. It deliberately does
 * not write to the database: an officer reviews and edits the text in the
 * form before the alert is issued, so a mistranslated evacuation order
 * cannot reach anyone's phone unseen.
 */

export const maxDuration = 120;

const Schema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  instruction: z.string().trim().max(600).optional().nullable(),
  model: z.string().max(120).optional(),
  languages: z.array(z.string().max(8)).max(8).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("is_admin_or_above");
  if (allowed !== true) {
    return NextResponse.json({ error: "Only administrators can draft alerts." }, { status: 403 });
  }

  if (configuredProviders().length === 0) {
    return NextResponse.json(
      { error: "No AI provider is configured. Set SARVAM_API_KEY to enable translation." },
      { status: 503 },
    );
  }

  let parsed;
  try {
    parsed = Schema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await translateAlert(parsed.data);
    return NextResponse.json({
      ok: true,
      ...result,
      notice:
        "Machine-generated drafts. Review each one before issuing — Mizo output in particular has been observed to return the wrong language.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";
    console.error("[alerts/translate]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

/** GET — which models are available to the composer's picker. */
export async function GET() {
  return NextResponse.json({
    configured: configuredProviders(),
    models: availableModels(),
    default: defaultModel().id,
    languages: TARGET_LANGUAGES,
  });
}
