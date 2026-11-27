# Punto de restauración previo a Gestión — 2026-11-26

## Código
- Repositorio: gataedal/grayxon-group
- Rama de referencia: main
- Commit actual respaldado: 797a4241e26a65350aebb9169b3b6dd67da5c796
- Copia GitHub verificada: backup/pre-gestion-2026-11-26-main-797a424
- Verificación: la copia y main eran idénticas al crear el respaldo.
- Rama de respaldo anterior conservada: backup/pre-gestion-2026-11-26 (permanece en el commit base 456674a7161af9a89a6e8d5587f3189f92a195a7).
- Rama de trabajo: feature/gestion-module-2026-11-26
- No se modificó el contenido de main para crear el respaldo.

## Supabase
- Proyecto activo identificado: Grayxon Academy
- Project ref: vxyakhelhuikutepdjyn
- Estado observado: ACTIVE_HEALTHY
- Migraciones aplicadas verificadas hasta: 20261110013339
- No se aplicaron migraciones ni se modificaron datos durante esta auditoría.

## Integración actual revisada
- portal.html contiene la navegación global y los puntos de entrada del dashboard.
- grayxon-trabajo-entry.js agrega la tarjeta de acceso a los dashboards de administración y manager, validando gx_internal_members.
- grayxon-trabajo.html comparte el cliente Supabase/configuración y la navegación inferior del portal.
- grayxon-trabajo.js implementa la navegación interna y las vistas de tareas, solicitudes, equipo, áreas, actividad y calendario.
- creator-deliveries.js implementa Mis entregas como pantalla propia, con carga de gx_creator_deliveries y archivos privados mediante URLs firmadas.
- La migración de entregas existente conserva gx_creator_deliveries / gx_creator_delivery_files y sus políticas RLS.

## Límite del respaldo de base de datos
La conexión disponible permite consultar esquema, migraciones, políticas y datos, pero no expone una operación de exportación/restauración de un snapshot completo de la base de datos de producción. Por tanto, este punto de restauración protege el código, no constituye un backup completo de filas/archivos de producción. No se ejecutarán cambios DDL en producción hasta contar con un respaldo de base de datos verificable o una estrategia de restauración aprobada.

## Principios para la implementación
- No editar ni desplegar sobre main durante el desarrollo.
- Mantener el cliente Supabase compartido, autenticación actual, roles y navegación global.
- Reutilizar la pantalla Mis entregas separando Multimedia y Planes de acción.
- Mantener los archivos multimedia y sus flujos actuales sin cambios funcionales.
- Crear tablas nuevas y políticas RLS específicas para planes, objetivos, importaciones y publicaciones.
- Mantener los datos segregados por creador y mes; no mezclar ciclos mensuales.
- Preparar rollback SQL y pruebas antes de cualquier despliegue.
