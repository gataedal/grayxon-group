# Grayxon Beta — estado de validación

Última revisión: 2026-10-15.

## Separación
- Rama: `beta`
- Supabase Beta: `wnflvxbxgrupggtzlblh`
- `config.js` en `beta` apunta a la URL y publishable key de Beta.
- `main/config.js` conserva el proyecto de producción `vxyakhelhuikutepdjyn`.
- No combinar `fix-events-ux` ni `beta` con `main` sin validar primero.

## Código
- `app.js` de `beta` actualizado a la versión Events Matrix V2.3 de `fix-events-ux`.
- Comprobación de sintaxis JavaScript: correcta.
- Migración SQL de RPC de torneo en este repositorio: `supabase/migrations/20261015233800_beta_event_core_rpcs.sql`.

## Supabase Beta
Migraciones registradas en la base Beta:
- `20261015233310 restore_event_poll_payment_schema_beta`
- `20261015233342 restore_event_poll_payment_rls_beta`
- `20261015233644 gx_events_generate_round_beta`
- `20261015233649 gx_events_save_match_result_beta`
- `20261015233700 gx_event_leaderboard_beta`
- `20261015233707 gx_events_participant_rpcs_beta`
- `20261015234054 align_poll_schema_and_rpcs_beta`
- `20261015234112 secure_poll_visibility_and_rpcs_beta`
- `20261015234136 event_and_poll_notifications_beta`
- `20261015234222 align_poll_attachment_fields_beta`
- `202610152343xx fix_poll_participation_audience_beta` (versión exacta registrada por Supabase pendiente de confirmar)

## Pruebas de base de datos realizadas
- Flujo de torneo en una prueba temporal: generar ronda, registrar resultado y consultar ranking.
- Flujo de encuesta en una prueba temporal: insertar encuesta y opciones con los nombres de campos que usa el portal, registrar voto, consultar resultados, marcar lectura y generar notificaciones.
- Se limpiaron los datos temporales después de las pruebas. Verificación posterior: 0 eventos de prueba, 0 encuestas de prueba y 0 notificaciones de prueba.
- No se crearon batallas ni encuestas ficticias en producción.

## Pendiente antes de dar Beta por lista
- El repositorio no tiene ejecuciones de GitHub Actions para la rama Beta.
- El archivo `CNAME` de la rama Beta aún contiene `www.grayxongroup.com`, el dominio real. No desplegar esta rama con GitHub Pages hasta disponer de un destino de pruebas separado; eso podría afectar la web pública.
- Faltan pruebas reales en navegador con sesiones de administrador, manager y creador, además de validar el flujo de notificaciones push. No afirmar que esas pruebas están superadas.
- Las migraciones iniciales de esquema/RLS se aplicaron directamente a la base Beta; antes de intentar reconstruir una base desde cero, exportar y revisar el SQL exacto aplicado.
