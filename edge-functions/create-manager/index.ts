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

  const syntheticEmail = `${username}@users.grayxongroup.com`
  const syntheticEmail = `${username}@users.grayxongroup.com`
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName, role: 'manager' }
  })
  if (createError || !created.user) {
    const msg = createError?.message || 'No se pudo crear el usuario de Auth.'
    if (/already.*registered|already exists/i.test(msg)) {
      return json({ error: `El acceso @${username} ya existe. Si corresponde a este manager, edítalo en lugar de crear otro.` }, 409)
    }
    return json({ error: msg }, 400)
  }

  const userId = created.user.id
  let managerRowId = managerId
  let managerCreatedHere = false
  let previousManager: any = null

  try {
    // IMPORTANT: create/update the manager row BEFORE the profile is created.
    // The profile assignment protection trigger runs on UPDATE of profiles;
    // by inserting the final manager_id in the initial profile row we avoid
    // that trigger entirely during manager provisioning.
    if (managerId) {
      const { data: existingManager, error: readManagerError } = await adminClient
        .from('managers')
        .select('id,name,phone,email,username,user_id,active,updated_at')
        .eq('id', managerId)
        .single()
      if (readManagerError || !existingManager) throw new Error(readManagerError?.message || 'No se encontró el manager.')
      previousManager = existingManager
      if (existingManager.user_id && existingManager.user_id !== userId) {
        throw new Error('Este manager ya tiene un acceso activo.')
      }
      const { error: managerUpdateError } = await adminClient.from('managers').update({
        name: fullName,
        phone,
        email,
        username,
        user_id: userId,
        active: true,
        updated_at: new Date().toISOString()
      }).eq('id', managerId)
      if (managerUpdateError) throw new Error(managerUpdateError.message)
    } else {
      const { data: managerRow, error: managerInsertError } = await adminClient.from('managers').insert({
        name: fullName,
        phone,
        email,
        username,
        user_id: userId,
        active: true
      }).select('id').single()
      if (managerInsertError || !managerRow) throw new Error(managerInsertError?.message || 'No se pudo crear el registro del manager.')
      managerRowId = managerRow.id
      managerCreatedHere = true
    }

    const { error: profileInsertError } = await adminClient.from('profiles').insert({
      id: userId,
      username,
      full_name: fullName,
      role: 'manager',
      active: true,
      manager_id: managerRowId
    })
    if (profileInsertError) throw new Error(profileInsertError.message)
  } catch (e) {
    // Best-effort compensation so a failed provisioning never leaves a
    // half-created Auth user or an incorrectly linked manager.
    if (managerCreatedHere && managerRowId) {
      await adminClient.from('managers').delete().eq('id', managerRowId)
    } else if (managerId && previousManager) {
      await adminClient.from('managers').update({
        name: previousManager.name,
        phone: previousManager.phone,
        email: previousManager.email,
        username: previousManager.username,
        user_id: previousManager.user_id,
        active: previousManager.active,
        updated_at: previousManager.updated_at
      }).eq('id', managerId)
    }
    await adminClient.auth.admin.deleteUser(userId)
    return json({ error: e instanceof Error ? e.message : 'No se pudo completar la creación del manager.' }, 400)
  }
  return json({ ok: true, user: { id: userId, username }, manager: { id: managerRowId } })
})
