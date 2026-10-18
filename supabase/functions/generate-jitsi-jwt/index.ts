import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JWT_SECRET = Deno.env.get("JITSI_JWT_SECRET");
const JITSI_DOMAIN = "meet.grayxongroup.com";

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
async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const input = jsonPart({ alg: "HS256", typ: "JWT" }) + "." + jsonPart(payload);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return input + "." + b64url(new Uint8Array(sig));
}

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  try {
    if (!JWT_SECRET || JWT_SECRET.length !== 64 || !/^[a-f0-9]{64}$/i.test(JWT_SECRET)) {
      return response({ error: "Configuración de Jitsi incompleta." }, 500);
    }
    const userId = ctx.userClaims?.id;
    if (!userId) return response({ error: "Usuario no autenticado." }, 401);

    const { data: profile, error: pe } = await ctx.supabaseAdmin.from("profiles")
      .select("id, username, full_name, role, active, team_id, manager_id")
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
    // Query by primary key and take one row explicitly. Log structured database
    // diagnostics server-side so schema/cache issues can be identified without
    // exposing internal details to the browser.
    const { data: trainingRows, error: te } = await ctx.supabaseAdmin.from("live_trainings")
      .select("id, room_name, status, created_by").eq("id", trainingId).limit(1);
    if (te) {
      console.error("Training lookup failed", {
        code: te.code, message: te.message, details: te.details, hint: te.hint,
        trainingId,
      });
      return response({ error: "No se pudo consultar el entrenamiento.", code: "TRAINING_LOOKUP_FAILED" }, 500);
    }
    const training = trainingRows?.[0] ?? null;
    if (!training || !training.room_name) return response({ error: "Entrenamiento no encontrado." }, 404);
    if (["finished", "cancelled", "canceled"].includes(String(training.status).toLowerCase())) {
      return response({ error: "Este entrenamiento ya finalizó." }, 403);
    }
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(training.room_name)) {
      return response({ error: "La sala del entrenamiento no es válida." }, 500);
    }

    let allowed = profile.role === "admin" || training.created_by === userId;
    const moderator = profile.role === "admin" || training.created_by === userId; // El creador es anfitrión y los administradores de Grayxon tienen control total.

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
      const { data: managerRecord, error: managerError } = await ctx.supabaseAdmin.from("managers")
        .select("id").eq("user_id", userId).eq("active", true).maybeSingle();
      if (managerError) {
        console.error("Manager lookup failed", managerError);
        return response({ error: "No se pudo validar el acceso al entrenamiento." }, 500);
      }
      if (managerRecord) {
        const { data: managedTeams, error: teamsError } = await ctx.supabaseAdmin.from("teams")
          .select("id").eq("manager_id", managerRecord.id);
        if (teamsError) {
          console.error("Managed teams lookup failed", teamsError);
          return response({ error: "No se pudo validar el equipo del manager." }, 500);
        }
        const teamIds = new Set((managedTeams ?? []).map((team: { id: string }) => team.id));
        allowed = (audience ?? []).some((a: { target_type: string; target_id: string | null }) =>
          a.target_type === "all_managers" ||
          (a.target_type === "manager" && a.target_id === managerRecord.id) ||
          (a.target_type === "team" && !!a.target_id && teamIds.has(a.target_id)));
      }
    }
    if (!allowed) return response({ error: "No tienes permiso para entrar a este entrenamiento." }, 403);

    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({
      iss: "grayxon", aud: "grayxon", sub: JITSI_DOMAIN,
      room: training.room_name, iat: now, nbf: now - 10, exp: now + 3600,
      context: { user: { id: profile.id, name: profile.full_name || profile.username || "Usuario Grayxon",
        moderator: moderator, affiliation: moderator ? "owner" : "member" } },
    }, JWT_SECRET);
    return response({ token, roomName: training.room_name, domain: JITSI_DOMAIN, moderator,
      user: { id: profile.id, username: profile.username, full_name: profile.full_name, role: profile.role } });
  } catch (error) {
    console.error("generate-jitsi-jwt error", error);
    return response({ error: "Error interno al generar el token de Jitsi." }, 500);
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