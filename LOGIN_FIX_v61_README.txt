# Grayxon v62 — login + manager provisioning fix

## Cambio principal
El portal ya no genera nuevas identidades con `@users.grayxon.local`, porque ese dominio
no es válido para los flujos de Auth. Las nuevas cuentas usan:

`@users.grayxongroup.com`

El login sigue siendo únicamente `usuario + contraseña`.

## Compatibilidad
`app.js` intenta primero el dominio nuevo y, como fallback temporal, el dominio antiguo
para cuentas que todavía no hayan sido migradas.

## Andrea
La cuenta existente de Andrea debe cambiarse en Supabase Auth de:

`andrea.onyx@users.grayxon.local`

a:

`andrea.onyx@users.grayxongroup.com`

No cambies su UUID ni su contraseña.

Después del cambio, puede entrar con:
- Usuario: `andrea.onyx`
- Contraseña: la que ya tiene.

## Nuevos managers
La Edge Function `create-manager` de este ZIP ya usa el dominio nuevo.

## v62 — corrección preventiva para nuevos managers

La creación de managers ya no intenta insertar o actualizar dos veces el mismo manager/profile desde el frontend. La Edge Function crea primero el registro de manager y luego el profile final con `role=manager` y `manager_id` desde el inicio, evitando el trigger de protección de asignación. Si el proceso falla, intenta revertir el registro creado y elimina el usuario Auth para evitar cuentas a medias.

Importante: después de subir este ZIP, también debes actualizar/redeployar la Edge Function `create-manager` usando el `edge-functions/create-manager/index.ts` incluido.


v62 fix: corrected duplicate syntheticEmail declaration in create-manager and updated app.js cache version to v62.
