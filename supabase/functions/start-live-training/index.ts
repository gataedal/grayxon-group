import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

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
      console.error("start-live-training: profile lookup failed", profileError);
      return response({ error: "No se pudo validar el usuario." }, 500);
    }
    if (!profile || !profile.active) {
      return response({ error: "El usuario no está activo." }, 403);
    }

    const { data: training, error: trainingError } = await ctx.supabaseAdmin
      .from("live_trainings")
      .select("id, title, description, room_name, created_by, instructor_name, scheduled_at, status, started_at, ended_at")
      .eq("id", trainingId)
      .maybeSingle();
    if (trainingError) {
      console.error("start-live-training: training lookup failed", trainingError);
      return response({ error: "No se pudo consultar el entrenamiento." }, 500);
    }
    if (!training) return response({ error: "Entrenamiento no encontrado." }, 404);

    // Admins may start any training; otherwise only the recorded host may start it.
    // Team membership or audience membership is never sufficient for this action.
    const authorized = profile.role === "admin" || training.created_by === userId;
    if (!authorized) return response({ error: "Solo el anfitrión o un administrador puede iniciar el entrenamiento." }, 403);
    if (training.status !== "scheduled") {
      return response({ error: "El entrenamiento ya no está programado.", status: training.status }, 409);
    }
    if (!training.room_name || !/^[a-zA-Z0-9_-]{3,80}$/.test(training.room_name)) {
      return response({ error: "La sala del entrenamiento no es válida." }, 500);
    }

    // Fail closed if the session has no configured audience. The client may repair
    // legacy audience rows first, but the server independently checks before start.
    const { data: audience, error: audienceError } = await ctx.supabaseAdmin
      .from("live_training_audience")
      .select("id")
      .eq("training_id", trainingId)
      .limit(1);
    if (audienceError) {
      console.error("start-live-training: audience lookup failed", audienceError);
      return response({ error: "No se pudo validar la audiencia del entrenamiento." }, 500);
    }
    if (!audience?.length) {
      return response({ error: "El entrenamiento no tiene una audiencia configurada." }, 409);
    }

    const startedAt = new Date().toISOString();
    const { data: started, error: updateError } = await ctx.supabaseAdmin
      .from("live_trainings")
      .update({ status: "live", started_at: startedAt, ended_at: null })
      .eq("id", trainingId)
      .eq("status", "scheduled")
      .select("id, title, description, room_name, created_by, instructor_name, scheduled_at, status, started_at, ended_at")
      .maybeSingle();

    if (updateError) {
      // The existing partial unique index for one live session is the concurrency guard.
      if (updateError.code === "23505") {
        return response({ error: "Ya hay otro entrenamiento EN VIVO. Finalízalo antes de iniciar uno nuevo." }, 409);
      }
      console.error("start-live-training: status update failed", updateError);
      return response({ error: "No se pudo iniciar el entrenamiento." }, 500);
    }
    if (!started) {
      return response({ error: "El estado cambió mientras se iniciaba el entrenamiento. Actualiza el panel." }, 409);
    }

    return response({ ok: true, training: started });
  } catch (error) {
    console.error("start-live-training error", error);
    return response({ error: "Error interno al iniciar el entrenamiento." }, 500);
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
