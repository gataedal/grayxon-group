# Reconstrucción de Entrenamientos en vivo

## Alcance de esta rama

Esta rama es una zona de trabajo aislada. No se ha desplegado ninguna Edge Function ni se ha cambiado la configuración de Jitsi/Prosody/Jicofo. La migración `202610180002_jitsi_authoritative_close_events.sql` se aplicó únicamente a `grayxon-beta` para validar la estructura; no se aplicó a `Grayxon Academy`. La migración de idempotencia de asistencia sigue sin aplicarse.

## Cambios implementados hasta ahora

- El inicio de una sesión pasa por la Edge Function `start-live-training`; el navegador ya no cambia directamente `live_trainings.status` a `live`.
- La Edge Function valida la identidad autenticada, que el perfil esté activo, que el usuario sea administrador o el anfitrión persistido, que la sesión siga programada, que el nombre de sala sea válido y que exista una audiencia configurada.
- La política de permisos backend está centralizada en `supabase/functions/_shared/live-training-policy.ts` y se reutiliza en la generación del JWT, el inicio y la finalización.
- Los managers invitados y los creadores que no sean anfitriones no reciben privilegios de moderador por pertenecer a un equipo o a la audiencia.
- La selección de vídeo principal se reorganizó para resolver al anfitrión mediante el `userContext.id` de Jitsi y usar `getRoomsInfo`, `pinParticipant` y `setLargeVideoParticipant`, sin depender de broadcasts de ID del anfitrión ni de reintentos temporizados repetidos. La lectura de metadatos ahora acepta las dos formas de respuesta de `getRoomsInfo` (array directo o `{ rooms }`) y el identificador `id` o `participantId`.
- El cierre desde el panel ya no marca directamente una sesión como finalizada. La UI espera `readyToClose`, pero el estado persistente solo puede finalizarse después de que el receptor autenticado reciba el evento de servidor `muc-room-destroyed` de Prosody.
- La asistencia reutiliza un registro abierto tras reconexión y se incluye una migración opcional, protegida contra duplicados previos, para evitar dos registros abiertos de la misma persona y sesión.

## Política de roles

| Rol | Entrar | Moderar | Iniciar | Finalizar para todos |
|---|---|---|---|---|
| Administrador activo | Según las reglas del portal | Sí | Sí | Sí |
| Anfitrión registrado y activo | Si la sesión le corresponde | Sí | Sí | Sí |
| Manager invitado | Solo si está en la audiencia | No | No | No |
| Participante normal | Solo si está en la audiencia | No | No | No |

La autorización de entrada por audiencia es distinta de la autorización de moderación. La fuente de verdad para anfitrión es `live_trainings.created_by`, no el rol declarado por el navegador ni el orden de ingreso a Jitsi.

## Archivos modificados o añadidos

- `app.js`: inicio a través del servidor, prevención de finalización falsa y recuperación de asistencia abierta.
- `supabase/functions/_shared/live-training-policy.ts`: política de capacidades.
- `supabase/functions/start-live-training/index.ts`: inicio autorizado y actualización condicional de estado.
- `supabase/functions/generate-jitsi-jwt/index.ts`: reutiliza la política compartida.
- `supabase/functions/end-live-training/index.ts`: reutiliza la política compartida y exige un evento de cierre auténtico antes de confirmar el estado.
- `supabase/functions/jitsi-event-sync/index.ts`: receptor de eventos de Prosody protegido con `JITSI_EVENT_SYNC_TOKEN`; procesa el cierre a través de una RPC transaccional.
- `supabase/migrations/202610180002_jitsi_authoritative_close_events.sql`: tabla de auditoría de eventos Jitsi y función transaccional para finalizar la sesión y calcular la asistencia.
- `supabase/tests/live-training-policy.test.ts`: pruebas de la matriz de permisos.
- `supabase/migrations/202610180001_live_training_attendance_idempotency.sql`: índice parcial opcional para asistencia abierta; se detiene sin borrar datos si detecta duplicados.

## Verificaciones y pendientes

- Revisión de código y esquema: realizada mediante lectura del repositorio y consultas de solo lectura a los dos proyectos Supabase conectados. El portal en `config.js` apunta a `Grayxon Academy` (`vxyakhelhuikutepdjyn`); `grayxon-beta` (`wnflvxbxgrupggtzlblh`) tiene un esquema parecido pero con columnas más permisivas y actualmente no tiene Edge Functions. No se debe desplegar en uno u otro por suposiciones: el entorno de pruebas debe configurarse de forma explícita.
- Pruebas automatizadas: GitHub Actions aprobó `node --check app.js`, las ocho pruebas de política y los chequeos Deno de las Edge Functions, incluido `jitsi-event-sync`, en el commit `74a1704` (run 38).
- Integración real de las Edge Functions `start-live-training`, `end-live-training`, `generate-jitsi-jwt` y `jitsi-event-sync`: pendiente de despliegue controlado en `grayxon-beta`. Para `jitsi-event-sync`, el gateway debe permitir el acceso sin JWT de Supabase porque la función valida su propio Bearer secret (`verify_jwt=false`).
- Migración de idempotencia de asistencia: pendiente; no aplicada a ningún proyecto.
- Migración de cierre autoritativo: aplicada únicamente a `grayxon-beta`; no aplicada a `Grayxon Academy`.
- Jitsi real con administrador, anfitrión, manager invitado y participante: pendiente.
- Verificación de cámara, micrófono, vista principal, expulsión y cierre global: pendiente en navegador real.
- Verificación del comportamiento real del servidor Jitsi: pendiente de configurar y probar el plugin Prosody `event_sync_component`, su URL de eventos y el header `Authorization: Bearer ...`; falta acceso a configuración y logs de Jicofo/Prosody.
- Se añadió la vía de verificación autoritativa en código: el receptor solo acepta el evento `muc-room-destroyed` con un secreto compartido y la RPC registra el evento y finaliza el entrenamiento/asistencia en una transacción. La tabla y la RPC se aplicaron en `grayxon-beta` y se verificaron con consultas de solo lectura; la integración todavía no está operativa porque la Edge Function no se ha desplegado y Prosody aún no está configurado.
- Regresión de todas las demás secciones del portal: pendiente de ejecutar pruebas de navegador.

## Pruebas

Con Deno instalado en un checkout de esta rama:

```sh
deno test supabase/tests/live-training-policy.test.ts
```

Antes de aplicar la migración, ejecutar esta consulta de solo lectura en el proyecto objetivo:

```sql
select training_id, user_id, count(*) as open_rows
from public.live_training_participants
where left_at is null
group by training_id, user_id
having count(*) > 1;
```

Si devuelve filas, reconciliar manualmente esos registros antes de aplicar la migración. No borrar ni cerrar registros de asistencia automáticamente.

## Seguridad del despliegue

No desplegar `start-live-training` hasta confirmar que el proyecto Supabase de destino contiene las mismas tablas, columnas, políticas y función `withSupabase` compatibles. Configurar `JITSI_EVENT_SYNC_TOKEN` como secreto de la función y usar exactamente el mismo valor en `api_headers` del componente Prosody; nunca guardar el secreto en Git ni en el frontend. No desplegar funciones ni aplicar migraciones a `Grayxon Academy` como parte de este trabajo. La Edge Function de inicio y el cliente deben desplegarse juntos; de lo contrario, la interfaz nueva recibirá un 404.

### Configuración pendiente de Prosody para pruebas

Después de desplegar `jitsi-event-sync` en `grayxon-beta` y configurar el secreto `JITSI_EVENT_SYNC_TOKEN` en Supabase, el componente oficial de eventos de Prosody debe enviar el mismo Bearer token. El bloque es orientativo; confirmar el nombre exacto del componente MUC en la configuración actual del servidor antes de reiniciar servicios:

```lua
Component "esync.meet.grayxongroup.com" "event_sync_component"
    muc_component = "<MUC_COMPONENT_ACTUAL>"
    api_prefix = "https://wnflvxbxgrupggtzlblh.supabase.co/functions/v1/jitsi-event-sync"
    api_headers = {
        ["Authorization"] = "Bearer <JITSI_EVENT_SYNC_TOKEN>";
    }
```

El componente agrega rutas como `/events/room/destroyed` al `api_prefix`; la función está preparada para recibirlas. No instalar ni reiniciar Prosody hasta validar el nombre real del componente MUC y disponer de acceso de administración al servidor.
