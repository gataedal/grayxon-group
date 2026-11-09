import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: "No fue posible validar la sesión." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Sesión no válida." }, 401);

  const { data: adminProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,role,active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) return json({ error: "No se pudo validar el administrador." }, 500);
  if (!adminProfile || adminProfile.role !== "admin" || adminProfile.active !== true) {
    return json({ error: "Solo un administrador puede crear integrantes internos." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "El contenido enviado no es válido." }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.display_name ?? "").trim();
  const jobTitle = String(body.job_title ?? "Colaborador").trim();
  const departmentId = body.department_id ? String(body.department_id) : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Escribe un correo electrónico válido." }, 400);
  }
  if (password.length < 8) return json({ error: "La contraseña debe tener mínimo 8 caracteres." }, 400);
  if (displayName.length < 2 || displayName.length > 120) {
    return json({ error: "El nombre debe tener entre 2 y 120 caracteres." }, 400);
  }
  if (jobTitle.length < 2 || jobTitle.length > 80) {
    return json({ error: "El cargo debe tener entre 2 y 80 caracteres." }, 400);
  }

  if (departmentId) {
    const { data: department, error: departmentError } = await adminClient
      .from("gx_departments")
      .select("id,active")
      .eq("id", departmentId)
      .maybeSingle();
    if (departmentError) return json({ error: "No se pudo validar el área seleccionada." }, 500);
    if (!department || department.active !== true) {
      return json({ error: "El área seleccionada no está disponible." }, 400);
    }
  }

  const { data: createdAuth, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !createdAuth.user) {
    return json({ error: createError?.message || "No se pudo crear la cuenta." }, 400);
  }

  const { data: member, error: memberError } = await adminClient
    .from("gx_internal_members")
    .insert({
      user_id: createdAuth.user.id,
      email,
      display_name: displayName,
      access_level: "operational",
      job_title: jobTitle,
      department_id: departmentId,
      active: true,
      created_by: authData.user.id,
    })
    .select("id,user_id,email,display_name,access_level,job_title,department_id,active")
    .single();

  if (memberError || !member) {
    await adminClient.auth.admin.deleteUser(createdAuth.user.id);
    return json({ error: memberError?.message || "No se pudo guardar la membresía interna." }, 500);
  }

  return json({ member }, 201);
});
