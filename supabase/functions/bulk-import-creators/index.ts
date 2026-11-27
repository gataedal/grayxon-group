
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const normalize = (value: unknown) => String(value ?? '').trim()
const validUsername = (value: string) => /^[a-z0-9._-]{3,30}$/.test(value)

function makeTemporaryPassword() {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*-_'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let password = ''

  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length]
  }

  return password
}

type ImportRow = {
  source_row?: number
  tiktok_creator_id?: string
  tiktok_username?: string
  username?: string
  team_id?: string | null
}

Deno.serve(async (req) => {
  let stage = 'inicio'
  const requestId = crypto.randomUUID()

  try {
    console.log(`[${requestId}] Inicio de solicitud: ${req.method}`)

    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    stage = 'validar_variables'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error(`[${requestId}] Faltan variables de entorno.`)

      return json({
        error: 'Faltan variables de entorno de Supabase.',
        stage,
        request_id: requestId,
      }, 500)
    }

    stage = 'validar_token'

    const token = (req.headers.get('Authorization') || '')
      .replace(/^Bearer\s+/i, '')
      .trim()

    if (!token) {
      return json({
        error: 'Falta el token de autenticación.',
        stage,
        request_id: requestId,
      }, 401)
    }

    stage = 'crear_clientes_supabase'

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    })

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    stage = 'verificar_sesion'

    const { data: authData, error: authError } =
      await userClient.auth.getUser()

    const authenticatedUser = authData?.user

    if (authError || !authenticatedUser) {
      console.error(
        `[${requestId}] Falló la autenticación:`,
        authError?.message || 'No se encontró el usuario autenticado.',
      )

      return json({
        error: 'Sesión no válida.',
        details: authError?.message || null,
        stage,
        request_id: requestId,
      }, 401)
    }

    stage = 'verificar_administrador'

    const {
      data: adminProfile,
      error: profileError,
    } = await adminClient
      .from('profiles')
      .select('id,role,active')
      .eq('id', authenticatedUser.id)
      .maybeSingle()

    if (profileError) {
      console.error(
        `[${requestId}] Error consultando perfil administrador:`,
        profileError.message,
      )

      return json({
        error: profileError.message,
        stage,
        request_id: requestId,
      }, 500)
    }

    if (
      !adminProfile ||
      adminProfile.role !== 'admin' ||
      adminProfile.active !== true
    ) {
      return json({
        error: 'Solo un administrador activo puede importar creadores.',
        stage,
        request_id: requestId,
      }, 403)
    }

    stage = 'leer_archivo'

    let body: { rows?: ImportRow[] }

    try {
      body = await req.json()
    } catch (error) {
      return json({
        error: 'JSON inválido.',
        details: error instanceof Error ? error.message : String(error),
        stage,
        request_id: requestId,
      }, 400)
    }

    const rows = Array.isArray(body?.rows) ? body.rows : []

    if (!rows.length) {
      return json({
        error: 'No hay registros válidos para importar.',
        stage,
        request_id: requestId,
      }, 400)
    }

    if (rows.length > 500) {
      return json({
        error: 'El máximo permitido por importación es de 500 filas.',
        stage,
        request_id: requestId,
      }, 400)
    }

    console.log(
      `[${requestId}] Registros recibidos: ${rows.length}`,
    )

    stage = 'consultar_equipos'

    const {
      data: teams,
      error: teamsError,
    } = await adminClient
      .from('teams')
      .select('id,name,manager_id')

    if (teamsError) {
      console.error(
        `[${requestId}] Error consultando equipos:`,
        teamsError.message,
      )

      return json({
        error: teamsError.message,
        stage,
        request_id: requestId,
      }, 500)
    }

    const teamMap = new Map<string, any>(
      (teams || []).map((team: any) => [
        String(team.id),
        team,
      ] as [string, any]),
    )

    const seenIds = new Set<string>()
    const results: any[] = []

    for (let index = 0; index < rows.length; index++) {
      const source = rows[index]

      stage = `procesar_registro_${index + 1}`

      try {
        const tiktokCreatorId = normalize(source?.tiktok_creator_id)
          .replace(/\s/g, '')

        const tiktokUsername = normalize(source?.tiktok_username)
          .replace(/^@/, '')

        const username = normalize(source?.username).toLowerCase()
        const teamId = normalize(source?.team_id) || null

        const base = {
          source_row: Number(source?.source_row) || null,
          tiktok_creator_id: tiktokCreatorId,
          tiktok_username: tiktokUsername,
          username,
          team_id: teamId,
        }

        if (!/^\d{10,30}$/.test(tiktokCreatorId)) {
          results.push({
            ...base,
            status: 'failed',
            message: 'ID de TikTok inválido.',
          })
          continue
        }

        if (seenIds.has(tiktokCreatorId)) {
          results.push({
            ...base,
            status: 'failed',
            message: 'ID de TikTok repetido dentro del archivo.',
          })
          continue
        }

        seenIds.add(tiktokCreatorId)

        if (!validUsername(username)) {
          results.push({
            ...base,
            status: 'failed',
            message:
              'El usuario de acceso debe tener 3–30 caracteres y solo letras, números, punto, guion o guion bajo.',
          })
          continue
        }

        if (!tiktokUsername) {
          results.push({
            ...base,
            status: 'failed',
            message: 'Falta el nombre de usuario de TikTok.',
          })
          continue
        }

        let team: any = null

        if (teamId) {
          team = teamMap.get(teamId)

          if (!team) {
            results.push({
              ...base,
              status: 'failed',
              message: 'El equipo seleccionado ya no existe.',
            })
            continue
          }
        }

        stage = `comprobar_id_tiktok_${index + 1}`

        const {
          data: existingTikTok,
          error: idCheckError,
        } = await adminClient
          .from('profiles')
          .select('id,username')
          .eq('tiktok_creator_id', tiktokCreatorId)
          .maybeSingle()

        if (idCheckError) {
          results.push({
            ...base,
            status: 'failed',
            message: idCheckError.message,
          })
          continue
        }

        if (existingTikTok) {
          results.push({
            ...base,
            status: 'already_exists',
            username: existingTikTok.username,
            team_name: team?.name || 'Sin equipo',
            message:
              'Este ID de TikTok ya está registrado; no se creó otra cuenta.',
          })
          continue
        }

        stage = `comprobar_usuario_${index + 1}`

        const {
          data: existingUsername,
          error: usernameCheckError,
        } = await adminClient
          .from('profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle()

        if (usernameCheckError) {
          results.push({
            ...base,
            status: 'failed',
            message: usernameCheckError.message,
          })
          continue
        }

        if (existingUsername) {
          results.push({
            ...base,
            status: 'failed',
            message:
              `El usuario @${username} ya existe en Grayxon. Revisa el conflicto antes de importar.`,
          })
          continue
        }

        stage = `crear_autenticacion_${index + 1}`

        const password = makeTemporaryPassword()
        const syntheticEmail = `${username}@users.grayxongroup.com`

        const {
          data: created,
          error: createError,
        } = await adminClient.auth.admin.createUser({
          email: syntheticEmail,
          password,
          email_confirm: true,
          user_metadata: {
            username,
            role: 'creator',
            tiktok_username: tiktokUsername,
          },
        })

        const createdUser = created?.user

        if (createError || !createdUser) {
          results.push({
            ...base,
            status: 'failed',
            message:
              createError?.message ||
              'No se pudo crear el acceso de autenticación.',
          })
          continue
        }

        stage = `guardar_perfil_${index + 1}`

        const profilePayload = {
          id: createdUser.id,
          username,
          full_name: null,
          role: 'creator',
          active: true,
          team_id: team?.id || null,
          manager_id: team?.manager_id || null,
          tiktok_username: tiktokUsername,
          tiktok_creator_id: tiktokCreatorId,
          must_change_password: true,
          onboarding_required: true,
        }

        const { error: insertError } = await adminClient
          .from('profiles')
          .insert(profilePayload)

        if (insertError) {
          console.error(
            `[${requestId}] Error guardando perfil ${username}:`,
            insertError.message,
          )

          const { error: deleteError } =
            await adminClient.auth.admin.deleteUser(createdUser.id)

          results.push({
            ...base,
            status: 'failed',
            message: deleteError
              ? `No se pudo guardar el perfil: ${insertError.message}. También falló la limpieza del acceso temporal: ${deleteError.message}`
              : `No se pudo guardar el perfil; el acceso temporal fue eliminado. ${insertError.message}`,
          })
          continue
        }

        results.push({
          ...base,
          status: 'created',
          team_name: team?.name || 'Sin equipo',
          manager_id: team?.manager_id || null,
          temporary_password: password,
          message:
            'Cuenta creada; deberá cambiar la contraseña al primer ingreso.',
        })

        console.log(
          `[${requestId}] Cuenta creada: ${username}, registro ${index + 1}/${rows.length}`,
        )
      } catch (rowError) {
        const details = rowError instanceof Error
          ? rowError.message
          : String(rowError)

        console.error(
          `[${requestId}] Error procesando registro ${index + 1}:`,
          details,
        )

        results.push({
          source_row: Number(source?.source_row) || null,
          tiktok_creator_id: normalize(source?.tiktok_creator_id),
          tiktok_username: normalize(source?.tiktok_username),
          username: normalize(source?.username).toLowerCase(),
          team_id: normalize(source?.team_id) || null,
          status: 'failed',
          message: `Error inesperado en este registro: ${details}`,
        })
      }
    }

    stage = 'generar_informe'

    const summary = {
      ok: true,
      request_id: requestId,
      total: rows.length,
      created: results.filter((r) => r.status === 'created').length,
      already_exists: results.filter(
        (r) => r.status === 'already_exists',
      ).length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    }

    console.log(
      `[${requestId}] Importación terminada: creadas=${summary.created}, existentes=${summary.already_exists}, fallidas=${summary.failed}`,
    )

    return json(summary)
  } catch (error) {
    const details = error instanceof Error
      ? error.stack || error.message
      : String(error)

    console.error(
      `[${requestId}] Error inesperado en etapa "${stage}":`,
      details,
    )

    return json({
      error: 'Error interno en la importación.',
      details: error instanceof Error
        ? error.message
        : String(error),
      stage,
      request_id: requestId,
    }, 500)
  }
})