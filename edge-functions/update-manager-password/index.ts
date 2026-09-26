import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Faltan variables de entorno de Supabase.' }, 500)
  }

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Falta el token de autenticación.' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Sesión no válida.' }, 401)

  const { data: adminProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('id,role,active')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError) return json({ error: profileError.message }, 500)
  if (!adminProfile || adminProfile.role !== 'admin' || adminProfile.active !== true) {
    return json({ error: 'Solo un administrador puede cambiar la contraseña de un manager.' }, 403)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const managerId = String(body?.manager_id || '').trim()
  const password = String(body?.password || '')
  if (!managerId) return json({ error: 'Falta el manager_id.' }, 400)
  if (password.length < 8) return json({ error: 'La contraseña debe tener mínimo 8 caracteres.' }, 400)

  const { data: manager, error: managerError } = await adminClient
    .from('managers')
    .select('id,user_id,active')
    .eq('id', managerId)
    .maybeSingle()

  if (managerError) return json({ error: managerError.message }, 500)
  if (!manager) return json({ error: 'No se encontró el manager.' }, 404)
  if (!manager.user_id) return json({ error: 'Este manager todavía no tiene un acceso de portal.' }, 409)

  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from('profiles')
    .select('id,role,active')
    .eq('id', manager.user_id)
    .maybeSingle()

  if (targetProfileError) return json({ error: targetProfileError.message }, 500)
  if (!targetProfile || targetProfile.role !== 'manager') {
    return json({ error: 'El acceso vinculado no corresponde a un perfil de manager.' }, 409)
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    manager.user_id,
    { password }
  )

  if (updateError) return json({ error: updateError.message }, 400)

  return json({ ok: true, manager_id: managerId })
})
