# Grayxon v60 — login fix

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
