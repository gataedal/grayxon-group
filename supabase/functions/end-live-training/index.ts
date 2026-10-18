import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

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

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  try {
    const userId = ctx.userClaims?.id;
    if (!userId) return response({ error: "Usuario no autenticado." }, 401);

    let body: { trainingId?: string } = {};
    try { body = await req.json(); } catch { /* invalid body */ }
    const trainingId = body.trainingId?.trim();
    if (!trainingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trainingId)) {
      return response({ error: "Debes indicar un trainingId válido." }, 400);
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
      .select("id, created_by, status")
      .eq("id", trainingId)
      .maybeSingle();
    if (trainingError) {
      console.error("End LIVE: training lookup failed", trainingError);
      return response({ error: "No se pudo consultar el entrenamiento." }, 500);
    }
    if (!training) return response({ error: "Entrenamiento no encontrado." }, 404);

    const authorized = profile.role === "admin" || training.created_by === userId;
    if (!authorized) return response({ error: "Solo el anfitrión o un administrador puede finalizar el entrenamiento." }, 403);

    if (["finished", "cancelled", "canceled"].includes(String(training.status).toLowerCase())) {
      return response({ ok: true, alreadyFinished: true });
    }

    const endedAt = new Date().toISOString();
    const { error: updateError } = await ctx.supabaseAdmin
      .from("live_trainings")
      .update({ status: "finished", ended_at: endedAt })
      .eq("id", trainingId)
      .eq("status", "live");
    if (updateError) {
      console.error("End LIVE: status update failed", updateError);
      return response({ error: "No se pudo guardar el cierre del entrenamiento." }, 500);
    }

    const { error: participantsError } = await ctx.supabaseAdmin
      .from("live_training_participants")
      .update({ left_at: endedAt })
      .eq("training_id", trainingId)
      .is("left_at", null);
    if (participantsError) {
      // The training status is already finalized; attendance reconciliation can
      // be retried separately and must not undo the successful close.
      console.error("End LIVE: participant reconciliation failed", participantsError);
    }

    return response({ ok: true, endedAt });
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
