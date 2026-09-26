import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: 'Faltan variables de entorno de Supabase.' }, 500)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Falta el token de autenticación.' }, 401)
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Sesión no válida.' }, 401)

  const { data: adminProfile, error: profileError } = await adminClient.from('profiles').select('id,role,active').eq('id', authData.user.id).maybeSingle()
  if (profileError) return json({ error: profileError.message }, 500)
  if (!adminProfile || adminProfile.role !== 'admin' || adminProfile.active !== true) return json({ error: 'Solo un administrador puede crear accesos de manager.' }, 403)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'JSON inválido.' }, 400) }
  const username = String(body?.username || '').trim().toLowerCase()
  const fullName = String(body?.full_name || '').trim()
  const password = String(body?.password || '')
  const phone = body?.phone ? String(body.phone).trim() : null
  const email = body?.email ? String(body.email).trim() : null
  const managerId = body?.manager_id ? String(body.manager_id) : null
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return json({ error: 'El usuario debe tener entre 3 y 40 caracteres y usar solo letras, números, punto, guion o guion bajo.' }, 400)
  if (!fullName) return json({ error: 'Escribe el nombre completo del manager.' }, 400)
  if (password.length < 8) return json({ error: 'La contraseña debe tener mínimo 8 caracteres.' }, 400)

  const { data: existingProfile } = await adminClient.from('profiles').select('id,role,username').eq('username', username).maybeSingle()
  if (existingProfile) return json({ error: `El usuario @${username} ya existe.` }, 409)
  if (managerId) {
    const { data: existingManager, error } = await adminClient.from('managers').select('id,user_id').eq('id', managerId).maybeSingle()
    if (error) return json({ error: error.message }, 500)
    if (!existingManager) return json({ error: 'No se encontró el manager.' }, 404)
    if (existingManager.user_id) return json({ error: 'Este manager ya tiene un acceso activo.' }, 409)
  }

  const syntheticEmail = `${username}@users.grayxon.local`
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email: syntheticEmail, password, email_confirm: true, user_metadata: { username, full_name: fullName, role: 'manager' } })
  if (createError || !created.user) return json({ error: createError?.message || 'No se pudo crear el usuario de Auth.' }, 400)
  const userId = created.user.id
  let managerRowId = managerId

  try {
    const { error: profileInsertError } = await adminClient.from('profiles').insert({ id: userId, username, full_name: fullName, role: 'manager', active: true })
    if (profileInsertError) throw new Error(profileInsertError.message)
    if (managerId) {
      const { error } = await adminClient.from('managers').update({ name: fullName, phone, email, username, user_id: userId, active: true, updated_at: new Date().toISOString() }).eq('id', managerId)
      if (error) throw new Error(error.message)
    } else {
      const { data: managerRow, error } = await adminClient.from('managers').insert({ name: fullName, phone, email, username, user_id: userId, active: true }).select('id').single()
      if (error) throw new Error(error.message)
      managerRowId = managerRow.id
    }
    const { error } = await adminClient.from('profiles').update({ manager_id: managerRowId }).eq('id', userId)
    if (error) throw new Error(error.message)
  } catch (e) {
    await adminClient.auth.admin.deleteUser(userId)
    return json({ error: e instanceof Error ? e.message : 'No se pudo completar la creación del manager.' }, 400)
  }
  return json({ ok: true, user: { id: userId, username }, manager: { id: managerRowId } })
})
