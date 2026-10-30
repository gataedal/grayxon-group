import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { AccessToken } from "npm:livekit-server-sdk@2.13.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const API_KEY = Deno.env.get("LIVEKIT_API_KEY");
const API_SECRET = Deno.env.get("LIVEKIT_API_SECRET");
const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL");

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  try {
    if (!API_KEY || !API_SECRET || !LIVEKIT_URL || !/^wss:\/\//.test(LIVEKIT_URL)) {
      console.error("LiveKit server configuration is incomplete.");
      return response({ error: "La conexión de video todavía no está configurada en el servidor." }, 503);
    }
    const userId = ctx.userClaims?.id;
    if (!userId) return response({ error: "Usuario no autenticado." }, 401);

    const { data: profile, error: pe } = await ctx.supabaseAdmin.from("profiles")
      .select("id, username, full_name, role, active, team_id")
      .eq("id", userId).maybeSingle();
    if (pe) { console.error("Profile lookup failed", pe); return response({ error: "No se pudo consultar el perfil." }, 500); }
    if (!profile) return response({ error: "Perfil de Grayxon no encontrado." }, 404);
    if (!profile.active) return response({ error: "El acceso del usuario está desactivado." }, 403);

    let body: { trainingId?: string } = {};
    try { body = await req.json(); } catch { /* invalid body */ }
    const trainingId = body.trainingId?.trim();
    if (!trainingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trainingId)) {
      return response({ error: "Debes indicar un trainingId válido." }, 400);
    }
    const { data: rows, error: te } = await ctx.supabaseAdmin.from("live_trainings")
      .select("id, room_name, status, created_by, livekit_host_user_id").eq("id", trainingId).limit(1);
    if (te) {
      console.error("Training lookup failed", te);
      if (te.code === "42703" || /livekit_host_user_id/i.test(String(te.message || ""))) {
        return response({ error: "Falta aplicar la migración de identidad de LiveKit." }, 503);
      }
      return response({ error: "No se pudo consultar el entrenamiento." }, 500);
    }
    const training = rows?.[0] ?? null;
    if (!training?.room_name) return response({ error: "Entrenamiento no encontrado." }, 404);
    if (["finished", "cancelled", "canceled"].includes(String(training.status).toLowerCase())) {
      return response({ error: "Este entrenamiento ya finalizó." }, 403);
    }
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(training.room_name)) {
      return response({ error: "La sala del entrenamiento no es válida." }, 500);
    }

    const moderator = profile.role === "admin" || training.created_by === userId;
    let allowed = moderator;
    const { data: audience, error: ae } = await ctx.supabaseAdmin.from("live_training_audience")
      .select("target_type, target_id").eq("training_id", training.id);
    if (ae) { console.error("Audience lookup failed", ae); return response({ error: "No se pudo validar el acceso al entrenamiento." }, 500); }

    if (!allowed && profile.role === "creator") {
      allowed = (audience ?? []).some((a: { target_type: string; target_id: string | null }) =>
        a.target_type === "all_creators" ||
        (a.target_type === "creator" && a.target_id === profile.id) ||
        (a.target_type === "team" && !!profile.team_id && a.target_id === profile.team_id));
    }
    if (!allowed && profile.role === "manager") {
      const { data: managerRecord, error: me } = await ctx.supabaseAdmin.from("managers")
        .select("id").eq("user_id", userId).eq("active", true).maybeSingle();
      if (me) { console.error("Manager lookup failed", me); return response({ error: "No se pudo validar el acceso al entrenamiento." }, 500); }
      if (managerRecord) {
        const { data: teams, error: te2 } = await ctx.supabaseAdmin.from("teams")
          .select("id").eq("manager_id", managerRecord.id);
        if (te2) { console.error("Managed teams lookup failed", te2); return response({ error: "No se pudo validar el equipo del manager." }, 500); }
        const teamIds = new Set((teams ?? []).map((t: { id: string }) => t.id));
        allowed = (audience ?? []).some((a: { target_type: string; target_id: string | null }) =>
          a.target_type === "all_managers" ||
          (a.target_type === "manager" && a.target_id === managerRecord.id) ||
          (a.target_type === "team" && !!a.target_id && teamIds.has(a.target_id)));
      }
    }
    if (!allowed) return response({ error: "No tienes permiso para entrar a este entrenamiento." }, 403);

    const identity = String(profile.id);
    const { data: profileDetails, error: avatarError } = await ctx.supabaseAdmin
      .from("profile_details")
      .select("avatar_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (avatarError) {
      console.error("Profile avatar lookup failed", avatarError);
      return response({ error: "No se pudo cargar la foto de perfil." }, 500);
    }

    // Set by the trusted start endpoint; do not infer the host from created_by.
    const sessionHostUserId = String(training.livekit_host_user_id || "");
    const participantMetadata = JSON.stringify({
      avatar_url: typeof profileDetails?.avatar_url === "string" ? profileDetails.avatar_url : "",
      session_host_user_id: sessionHostUserId,
    });
    const token = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: String(profile.full_name || profile.username || "Usuario Grayxon"),
      metadata: participantMetadata,
      ttl: "1h",
    });
    token.addGrant({
      roomJoin: true,
      room: training.room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: moderator,
    });
    const jwt = await token.toJwt();
    return response({
      token: jwt,
      serverUrl: LIVEKIT_URL,
      roomName: training.room_name,
      moderator,
      sessionHostUserId,
      user: { id: profile.id, username: profile.username, full_name: profile.full_name, role: profile.role },
    });
  } catch (error) {
    console.error("generate-livekit-token error", error);
    return response({ error: "Error interno al generar el acceso de video." }, 500);
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
