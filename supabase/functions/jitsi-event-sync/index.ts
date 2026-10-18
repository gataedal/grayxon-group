import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const EXPECTED_EVENT = "muc-room-destroyed";
const ROOM_RE = /^[a-zA-Z0-9_-]{3,80}$/;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const eventToken = Deno.env.get("JITSI_EVENT_SYNC_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!eventToken || eventToken.length < 32 || !supabaseUrl || !serviceRoleKey) {
    console.error("jitsi-event-sync: missing required server configuration");
    return json({ error: "Receptor de eventos no configurado." }, 503);
  }

  const authorization = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || !safeEqual(match[1], eventToken)) {
    return json({ error: "No autorizado." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Payload no válido." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "JSON no válido." }, 400);
  }

  // The same Prosody event-sync component sends other room/occupant events to
  // this API prefix. Acknowledge unrelated events so Prosody does not retry them.
  if (body.event_name !== EXPECTED_EVENT || body.is_breakout === true) {
    return json({ accepted: true, ignored: true }, 202);
  }

  const roomName = String(body.room_name || "");
  const roomJid = String(body.room_jid || "");
  const meetingId = body.meeting_id == null ? null : String(body.meeting_id);
  const destroyedSeconds = Number(body.destroyed_at);
  if (!ROOM_RE.test(roomName) || !roomJid || roomJid.length > 512 ||
      !Number.isFinite(destroyedSeconds) || destroyedSeconds <= 0 ||
      (meetingId !== null && meetingId.length > 128)) {
    return json({ error: "Evento de cierre incompleto o inválido." }, 400);
  }

  const destroyedAt = new Date(destroyedSeconds * 1000);
  if (!Number.isFinite(destroyedAt.getTime()) || destroyedAt.getTime() > Date.now() + 60_000) {
    return json({ error: "Fecha de cierre inválida." }, 400);
  }

  const eventKey = await sha256([
    roomJid,
    meetingId || "",
    String(Math.floor(destroyedSeconds)),
  ].join("|"));

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("finalize_live_training_from_jitsi_event", {
    p_event_key: eventKey,
    p_event_name: EXPECTED_EVENT,
    p_room_name: roomName,
    p_room_jid: roomJid,
    p_meeting_id: meetingId,
    p_destroyed_at: destroyedAt.toISOString(),
  });

  if (error) {
    console.error("jitsi-event-sync: trusted close event processing failed", {
      code: error.code,
      message: error.message,
    });
    return json({ error: "No se pudo procesar el cierre de Jitsi." }, 500);
  }

  const rows = Array.isArray(data) ? data : [];
  return json({
    accepted: true,
    matchedTraining: rows.length > 0,
    finalized: rows.some((row: { finalized?: boolean }) => row.finalized === true),
  });
});
