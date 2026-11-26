
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!

      const publishableKeys = JSON.parse(
        Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!
      )

      const secretKeys = JSON.parse(
        Deno.env.get('SUPABASE_SECRET_KEYS')!
      )

      const publishableKey = publishableKeys['default']
      const secretKey = secretKeys['default']

      // Cliente del usuario autenticado
      const supabase = createClient(
        supabaseUrl,
        publishableKey,
        {
          global: {
            headers: {
              Authorization: req.headers.get('Authorization') ?? '',
            },
          },
        }
      )

      // Cliente administrativo
      const supabaseAdmin = createClient(
        supabaseUrl,
        secretKey
      )

      // Obtener usuario autenticado
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        console.error('AUTH ERROR:', userError)

        return new Response(
          JSON.stringify({
            error: 'No autenticado.',
            details: userError?.message ?? null,
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      console.log('Usuario autenticado:', user.id)

      // IMPORTANTE:
      // Consultamos el perfil usando el cliente del usuario.
      // Así respetamos la política RLS que ya configuramos.
      const {
        data: adminProfile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('id, username, role, active')
        .eq('id', user.id)
        .maybeSingle()

      console.log('Perfil encontrado:', adminProfile)
      console.log('Error perfil:', profileError)

      if (profileError) {
        return new Response(
          JSON.stringify({
            error: 'Error consultando tu perfil.',
            details: profileError.message,
            code: profileError.code,
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      if (
        !adminProfile ||
        adminProfile.role !== 'admin' ||
        adminProfile.active !== true
      ) {
        return new Response(
          JSON.stringify({
            error: 'No tienes permisos de administrador.',
            profile: adminProfile ?? null,
          }),
          {
            status: 403,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      // Leer datos enviados desde Grayxon Academy
      const body = await req.json()

      const username = String(body.username || '')
        .trim()
        .toLowerCase()

      const fullName = String(body.full_name || '').trim()

      const password = String(body.password || '')

      if (!username || !password) {
        return new Response(
          JSON.stringify({
            error: 'Usuario y contraseña son obligatorios.',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        return new Response(
          JSON.stringify({
            error:
              'El usuario debe tener entre 3 y 30 caracteres y solo puede usar letras minúsculas, números, punto, guion o guion bajo.',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      if (password.length < 8) {
        return new Response(
          JSON.stringify({
            error: 'La contraseña debe tener mínimo 8 caracteres.',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      // Verificar username existente
      const {
        data: existingProfile,
        error: existingError,
      } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle()

      if (existingError) {
        console.error('EXISTING PROFILE ERROR:', existingError)

        return new Response(
          JSON.stringify({
            error: 'No se pudo verificar el nombre de usuario.',
            details: existingError.message,
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      if (existingProfile) {
        return new Response(
          JSON.stringify({
            error: 'Ese nombre de usuario ya existe.',
          }),
          {
            status: 409,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      // Email interno SOLO para Supabase Auth
      const internalEmail =
        `${username}@users.grayxon.local`

      // Crear usuario real en Supabase Auth
      const {
        data: createdUser,
        error: createUserError,
      } =
        await supabaseAdmin.auth.admin.createUser({
          email: internalEmail,
          password,
          email_confirm: true,
          user_metadata: {
            username,
            full_name: fullName,
          },
        })

      if (createUserError || !createdUser.user) {
        console.error(
          'CREATE USER ERROR:',
          createUserError
        )

        return new Response(
          JSON.stringify({
            error:
              createUserError?.message ||
              'No fue posible crear el usuario.',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      const newUserId = createdUser.user.id

      // Crear perfil
      // Todas las cuentas nuevas deben cambiar su contraseña
      // durante el primer inicio de sesión.
      const {
        error: insertProfileError,
      } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: newUserId,
          username,
          full_name: fullName || null,
          role: 'creator',
          active: true,
          must_change_password: true,
          onboarding_required: true,
        })

      if (insertProfileError) {
        console.error(
          'INSERT PROFILE ERROR:',
          insertProfileError
        )

        // Revertir usuario Auth si falló el perfil
        await supabaseAdmin.auth.admin.deleteUser(
          newUserId
        )

        return new Response(
          JSON.stringify({
            error:
              'No fue posible completar el perfil del creador.',
            details: insertProfileError.message,
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      console.log(
        'CREADOR CREADO:',
        username,
        newUserId
      )

      return new Response(
        JSON.stringify({
          success: true,
          creator: {
            id: newUserId,
            username,
            full_name: fullName || null,
          },
        }),
        {
          status: 201,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      )
    } catch (error) {
      console.error('UNEXPECTED ERROR:', error)

      return new Response(
        JSON.stringify({
          error: 'Error interno del servidor.',
          details:
            error instanceof Error
              ? error.message
              : String(error),
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      )
    }
  },
}