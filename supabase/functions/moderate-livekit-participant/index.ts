import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { resolveLiveTrainingCapabilities } from "../_shared/live-training-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["audio", "video", "pin"]);

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function jsonPart(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}
async function signRoomAdminToken(apiKey: string, apiSecret: string, userId: string, roomName: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = jsonPart({ alg: "HS256", typ: "JWT" });
  const payload = jsonPart({
    iss: apiKey, sub: userId, nbf: now - 5, exp: now + 60,
    video: { roomAdmin: true, room: roomName },
  });
  const input = header + "." + payload;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return input + "." + b64url(new Uint8Array(signature));
}
function liveKitHttpBase(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "wss:") url.protocol = "https:";
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch { return null; }
}

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  try {
    const userId = ctx.userClaims?.id;
    if (!userId) return response({ error: "Usuario no autenticado." }, 401);

    let body: { trainingId?: string; participantId?: string; action?: string } = {};
    try { body = await req.json(); } catch { return response({ error: "Solicitud no válida." }, 400); }
    const trainingId = String(body.trainingId ?? "").trim();
    const participantId = String(body.participantId ?? "").trim();
    const action = String(body.action ?? "").trim();
    if (!UUID_RE.test(trainingId)) return response({ error: "Debes indicar un entrenamiento válido." }, 400);
    if (!participantId || participantId.length > 128 || participantId === userId) {
      return response({ error: "El participante seleccionado no es válido." }, 400);
    }
    if (!ACTIONS.has(action)) return response({ error: "Acción de moderación no válida." }, 400);

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from("profiles").select("id, role, active").eq("id", userId).maybeSingle();
    if (profileError) {
      console.error("moderate-livekit-participant: profile lookup failed", profileError);
      return response({ error: "No se pudo validar el usuario." }, 500);
    }
    if (!profile || !profile.active) return response({ error: "El acceso del usuario está desactivado." }, 403);

    const { data: training, error: trainingError } = await ctx.supabaseAdmin
      .from("live_trainings").select("id, room_name, created_by, status").eq("id", trainingId).maybeSingle();
    if (trainingError) {
      console.error("moderate-livekit-participant: training lookup failed", trainingError);
      return response({ error: "No se pudo consultar el entrenamiento." }, 500);
    }
    if (!training?.room_name) return response({ error: "Entrenamiento no encontrado." }, 404);
    if (["finished", "cancelled", "canceled"].includes(String(training.status ?? "").toLowerCase())) {
      return response({ error: "Este entrenamiento ya finalizó." }, 409);
    }
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(training.room_name)) {
      return response({ error: "La sala del entrenamiento no es válida." }, 500);
    }

    const capabilities = resolveLiveTrainingCapabilities(userId, profile.role, profile.active, training.created_by);
    if (!capabilities.canModerate) {
      return response({ error: "Solo el anfitrión o un administrador puede moderar participantes." }, 403);
    }

    // Pinning is authorized server-side here; the authorized client then broadcasts
    // the selected identity to the room over LiveKit's reliable data channel.
    if (action === "pin") return response({ ok: true, action, participantId });

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const liveKitUrl = Deno.env.get("LIVEKIT_URL");
    const baseUrl = liveKitUrl ? liveKitHttpBase(liveKitUrl) : null;
    if (!apiKey || !apiSecret || !baseUrl) {
      console.error("moderate-livekit-participant: LiveKit configuration missing");
      return response({ error: "La moderación de LiveKit no está configurada en el servidor." }, 503);
    }

    const token = await signRoomAdminToken(apiKey, apiSecret, userId, training.room_name);
    const listResponse = await fetch(`${baseUrl}/twirp/livekit.RoomService/ListParticipants`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ room: training.room_name }),
    });
    if (!listResponse.ok) {
      console.error("moderate-livekit-participant: ListParticipants failed", listResponse.status, (await listResponse.text()).slice(0, 300));
      return response({ error: "No se pudieron consultar los participantes de LiveKit." }, 502);
    }
    const roomData = await listResponse.json().catch(() => null);
    const participant = Array.isArray(roomData?.participants)
      ? roomData.participants.find((item: { identity?: string }) => String(item.identity ?? "") === participantId)
      : null;
    if (!participant) return response({ error: "Ese participante ya no está en la llamada." }, 404);

    const wantedType = action === "audio" ? 0 : 1; // LiveKit TrackType: AUDIO=0, VIDEO=1
    const tracks = Array.isArray(participant.tracks) ? participant.tracks : [];
    const track = tracks.find((item: { type?: number; sid?: string; muted?: boolean }) =>
      Number(item.type) === wantedType && typeof item.sid === "string" && item.sid.length > 0);
    if (!track) {
      return response({ ok: true, action, participantId, alreadyMutedOrNotPublished: true });
    }

    const muteResponse = await fetch(`${baseUrl}/twirp/livekit.RoomService/MutePublishedTrack`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        room: training.room_name, identity: participantId, track_sid: track.sid, muted: true,
      }),
    });
    if (!muteResponse.ok) {
      console.error("moderate-livekit-participant: MutePublishedTrack failed", muteResponse.status, (await muteResponse.text()).slice(0, 300));
      return response({ error: action === "audio"
        ? "LiveKit no pudo silenciar el micrófono."
        : "LiveKit no pudo apagar la cámara." }, 502);
    }
    return response({ ok: true, action, participantId, muted: true });
  } catch (error) {
    console.error("moderate-livekit-participant error", error);
    return response({ error: "Error interno al moderar el participante." }, 500);
  }
});

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return response({ error: "Método no permitido." }, 405);
    const result = await handler(req);
    const headers = new Headers(result.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
  },
};
