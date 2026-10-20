import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { resolveLiveTrainingCapabilities } from "../_shared/live-training-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
async function signServerToken(apiKey: string, apiSecret: string, userId: string, grant: "roomList" | "roomCreate" | "roomAdmin") {
  const now = Math.floor(Date.now() / 1000);
  const header = jsonPart({ alg: "HS256", typ: "JWT" });
  const payload = jsonPart({
    iss: apiKey,
    sub: userId,
    nbf: now - 5,
    exp: now + 60,
    video: { [grant]: true },
  });
  const input = header + "." + payload;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return input + "." + b64url(new Uint8Array(signature));
}

function liveKitHttpBase(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "wss:") url.protocol = "https:";
    else if (url.protocol === "ws:") url.protocol = "http:";
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  try {
    const userId = ctx.userClaims?.id;
    if (!userId) return response({ error: "Usuario no autenticado." }, 401);

    let body: { trainingId?: string } = {};
    try { body = await req.json(); } catch { /* malformed body */ }
    const trainingId = String(body.trainingId ?? "").trim();
    if (!UUID_RE.test(trainingId)) {
      return response({ error: "Debes indicar un trainingId válido." }, 400);
    }

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id, role, active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      console.error("end-livekit-training: profile lookup failed", profileError);
      return response({ error: "No se pudo validar el usuario." }, 500);
    }
    if (!profile || !profile.active) return response({ error: "El usuario no está activo." }, 403);

    const { data: training, error: trainingError } = await ctx.supabaseAdmin
      .from("live_trainings")
      .select("id, room_name, created_by, status, started_at, ended_at, livekit_room_verified_at")
      .eq("id", trainingId)
      .maybeSingle();
    if (trainingError) {
      console.error("end-livekit-training: training lookup failed", trainingError);
      return response({ error: "No se pudo consultar el entrenamiento." }, 500);
    }
    if (!training) return response({ error: "Entrenamiento no encontrado." }, 404);

    const capabilities = resolveLiveTrainingCapabilities(
      userId, profile.role, profile.active, training.created_by,
    );
    if (!capabilities.canEndForAll) {
      return response({ error: "Solo el anfitrión o un administrador puede finalizar el entrenamiento." }, 403);
    }

    const status = String(training.status ?? "").toLowerCase();
    if (status === "finished") {
      return response({ ok: true, alreadyFinished: true, endedAt: training.ended_at ?? null });
    }
    if (status !== "live") {
      return response({ error: "El entrenamiento no está marcado como EN VIVO; no se modificó su estado.", status }, 409);
    }
    if (!training.room_name || !/^[a-zA-Z0-9_-]{3,80}$/.test(training.room_name)) {
      return response({ error: "La sala del entrenamiento no es válida." }, 500);
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const liveKitUrl = Deno.env.get("LIVEKIT_URL");
    const baseUrl = liveKitUrl ? liveKitHttpBase(liveKitUrl) : null;
    if (!apiKey || !apiSecret || !baseUrl) {
      console.error("end-livekit-training: LiveKit server credentials or URL are not configured");
      return response({ error: "La finalización global de LiveKit aún no está configurada en el servidor." }, 503);
    }

    // Confirm the room is actually present in LiveKit before attempting deletion.
    // This prevents the endpoint from accidentally finalizing a Jitsi-only session.
    let listResponse: Response;
    try {
      const listToken = await signServerToken(apiKey, apiSecret, userId, "roomList");
      listResponse = await fetch(`${baseUrl}/twirp/livekit.RoomService/ListRooms`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${listToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ names: [training.room_name] }),
      });
    } catch (error) {
      console.error("end-livekit-training: LiveKit ListRooms request failed", error);
      return response({ error: "No se pudo comprobar la sala en LiveKit. El entrenamiento no se marcó como finalizado." }, 502);
    }
    if (!listResponse.ok) {
      const detail = (await listResponse.text()).slice(0, 500);
      console.error("end-livekit-training: LiveKit rejected ListRooms", {
        status: listResponse.status, detail,
      });
      return response({ error: "LiveKit no permitió verificar la sala. El entrenamiento sigue sin finalizar." }, 502);
    }
    const roomList = await listResponse.json().catch(() => null);
    const roomExists = Array.isArray(roomList?.rooms) &&
      roomList.rooms.some((room: { name?: string }) => room.name === training.room_name);
    if (!roomExists) {
      // If this exact room was previously verified before deletion, retry only the
      // database reconciliation. Without the marker, a missing room is not proof
      // that this training was a LiveKit session.
      if (training.livekit_room_verified_at) {
        const retryEndedAt = new Date().toISOString();
        const { data: retriedFinalization, error: retryFinalizeError } = await ctx.supabaseAdmin.rpc(
          "finalize_live_training_from_livekit_delete",
          { p_training_id: trainingId, p_ended_at: retryEndedAt },
        );
        if (retryFinalizeError) {
          console.error("end-livekit-training: retry reconciliation failed", {
            code: retryFinalizeError.code, message: retryFinalizeError.message,
          });
          return response({
            error: "La sala ya no aparece en LiveKit, pero la sincronización sigue pendiente. Vuelve a intentarlo.",
            code: "LIVEKIT_DATABASE_RECONCILIATION_PENDING",
          }, 500);
        }
        return response({
          ok: true,
          endedAt: retryEndedAt,
          verifiedBy: "previous-livekit-room-verification",
          result: retriedFinalization,
        });
      }
      return response({
        error: "No se encontró una sala activa de LiveKit para este entrenamiento. No se modificó su estado.",
        code: "LIVEKIT_ROOM_NOT_FOUND",
      }, 409);
    }

    // Persist the verification before deletion so reconciliation can be retried
    // safely if DeleteRoom succeeds but the database RPC subsequently fails.
    const { data: markedTraining, error: markerError } = await ctx.supabaseAdmin
      .from("live_trainings")
      .update({ livekit_room_verified_at: new Date().toISOString() })
      .eq("id", trainingId)
      .eq("status", "live")
      .select("id")
      .maybeSingle();
    if (markerError) {
      console.error("end-livekit-training: failed to persist room verification", markerError);
      return response({
        error: "Se verificó la sala, pero no se pudo guardar la marca de seguridad. No se cerró la sala.",
        code: "LIVEKIT_VERIFICATION_MARKER_FAILED",
      }, 500);
    }
    if (!markedTraining) {
      return response({
        error: "El entrenamiento cambió de estado durante la verificación. No se cerró la sala.",
        code: "LIVE_TRAINING_STATE_CHANGED",
      }, 409);
    }

    const token = await signServerToken(apiKey, apiSecret, userId, "roomAdmin");
    let deleteResponse: Response;
    try {
      deleteResponse = await fetch(`${baseUrl}/twirp/livekit.RoomService/DeleteRoom`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ room: training.room_name }),
      });
    } catch (error) {
      console.error("end-livekit-training: LiveKit DeleteRoom request failed", error);
      return response({ error: "No se pudo contactar al servidor de LiveKit. El entrenamiento no se marcó como finalizado." }, 502);
    }

    if (!deleteResponse.ok) {
      const detail = (await deleteResponse.text()).slice(0, 500);
      console.error("end-livekit-training: LiveKit rejected DeleteRoom", {
        status: deleteResponse.status, detail,
      });
      return response({ error: "LiveKit no confirmó el cierre de la sala. El entrenamiento sigue sin finalizar.", code: "LIVEKIT_CLOSE_NOT_CONFIRMED" }, 502);
    }

    const endedAt = new Date().toISOString();
    const { data: finalized, error: finalizeError } = await ctx.supabaseAdmin.rpc(
      "finalize_live_training_from_livekit_delete",
      { p_training_id: trainingId, p_ended_at: endedAt },
    );
    if (finalizeError) {
      console.error("end-livekit-training: database reconciliation failed", {
        code: finalizeError.code, message: finalizeError.message,
      });
      return response({
        error: "LiveKit cerró la sala, pero no se pudo sincronizar el entrenamiento. Vuelve a intentarlo.",
        code: "LIVEKIT_DATABASE_RECONCILIATION_PENDING",
      }, 500);
    }

    return response({ ok: true, endedAt, verifiedBy: "livekit-room-service-delete", result: finalized });
  } catch (error) {
    console.error("end-livekit-training error", error);
    return response({ error: "Error interno al finalizar el entrenamiento de LiveKit." }, 500);
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
