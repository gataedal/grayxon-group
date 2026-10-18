import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { resolveLiveTrainingCapabilities } from "../_shared/live-training-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  try {
    const userId = ctx.userClaims?.id;
    if (!userId) return response({ error: "Usuario no autenticado." }, 401);

    let body: { trainingId?: string; action?: string } = {};
    try { body = await req.json(); } catch { /* invalid body */ }
    const trainingId = body.trainingId?.trim();
    const action = body.action ?? "authorize";
    if (!trainingId || !UUID_RE.test(trainingId)) {
      return response({ error: "Debes indicar un trainingId válido." }, 400);
    }
    if (action !== "authorize" && action !== "finalize") {
      return response({ error: "Acción no válida." }, 400);
    }

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id, role, active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      console.error("End LIVE: profile lookup failed", profileError);
      return response({ error: "No se pudo validar el usuario." }, 500);
    }
    if (!profile || !profile.active) return response({ error: "El usuario no está activo." }, 403);

    const { data: training, error: trainingError } = await ctx.supabaseAdmin
      .from("live_trainings")
      .select("id, created_by, status, room_name, started_at")
      .eq("id", trainingId)
      .maybeSingle();
    if (trainingError) {
      console.error("End LIVE: training lookup failed", trainingError);
      return response({ error: "No se pudo consultar el entrenamiento." }, 500);
    }
    if (!training) return response({ error: "Entrenamiento no encontrado." }, 404);

    const capabilities = resolveLiveTrainingCapabilities(userId, profile.role, profile.active, training.created_by);
    if (!capabilities.canEndForAll) return response({ error: "Solo el anfitrión o un administrador puede finalizar el entrenamiento." }, 403);

    const status = String(training.status ?? "").toLowerCase();
    if (["finished", "cancelled", "canceled"].includes(status)) {
      return response({ ok: true, alreadyFinished: true, action });
    }
    if (status !== "live") {
      return response({ error: "El entrenamiento no está marcado como EN VIVO; no se modificó su estado.", status }, 409);
    }

    // The first request only checks authorization. The client issues endConference
    // after this succeeds, then sends "finalize" to persist the result.
    if (action === "authorize") return response({ ok: true, authorized: true, action });

    // Only a trusted Prosody room-destroyed webhook can finalize the database
    // state. The browser's readyToClose event is useful UX, not server proof.
    if (!training.started_at || !training.room_name) {
      return response({ error: "No existe una hora de inicio válida para verificar el cierre.", status }, 409);
    }

    const { data: closeEvent, error: closeEventError } = await ctx.supabaseAdmin
      .from("jitsi_conference_events")
      .select("id, destroyed_at")
      .eq("room_name", training.room_name)
      .eq("event_name", "muc-room-destroyed")
      .gte("destroyed_at", training.started_at)
      .order("destroyed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (closeEventError) {
      console.error("End LIVE: authoritative Jitsi close lookup failed", {
        code: closeEventError.code,
        message: closeEventError.message,
      });
      return response({ error: "No se pudo verificar el cierre real de Jitsi." }, 500);
    }
    if (!closeEvent) {
      return response({
        error: "Jitsi todavía no ha confirmado el cierre en el servidor. El entrenamiento sigue sin finalizar en el panel.",
        code: "JITSI_CLOSE_NOT_CONFIRMED",
      }, 409);
    }

    // The trusted event handler atomically changes the training state and
    // reconciles attendance. Re-read to handle the event arriving between
    // the first status read and this verification.
    const { data: refreshed, error: refreshError } = await ctx.supabaseAdmin
      .from("live_trainings")
      .select("status, ended_at")
      .eq("id", trainingId)
      .maybeSingle();
    if (refreshError) {
      console.error("End LIVE: status recheck failed", refreshError);
      return response({ error: "El cierre de Jitsi se recibió, pero no se pudo confirmar el estado del entrenamiento." }, 500);
    }
    if (!refreshed || String(refreshed.status ?? "").toLowerCase() !== "finished") {
      return response({
        error: "Jitsi informó el cierre, pero el entrenamiento aún no pudo reconciliarse. Vuelve a comprobarlo.",
        code: "LIVE_TRAINING_RECONCILIATION_PENDING",
      }, 409);
    }

    return response({ ok: true, endedAt: refreshed.ended_at, action, verifiedBy: "jitsi-server-event" });
  } catch (error) {
    console.error("end-live-training error", error);
    return response({ error: "Error interno al finalizar el entrenamiento." }, 500);
  }
});

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const result = await handler(req);
    const headers = new Headers(result.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
  },
};
