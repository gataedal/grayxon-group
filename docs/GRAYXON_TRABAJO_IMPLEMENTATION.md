# Grayxon Trabajo — control de alcance y despliegue

## Alcance autorizado

Nuevo módulo de gestión operativa interna para administración y colaboradores autorizados. Los creadores de TikTok quedan excluidos.

- El permiso de acceso se separa del cargo y del área.
- Los únicos niveles de acceso del módulo son `admin` y `operational`.
- El cargo (`job_title`) y el área (`gx_departments`) son configurables.
- Administración crea y asigna tareas, revisa entregas, aprueba solicitudes y supervisa todo.
- Cada integrante operativo ve sus tareas asignadas y únicamente sus propias solicitudes.
- Una solicitud no es una tarea hasta que administración la convierte.
- Una tarea solo queda completada después de la aprobación administrativa.
- Se reutilizan las notificaciones actuales y el calendario existente.

## Aislamiento de datos

La migración `20261109000000_grayxon_trabajo.sql` crea exclusivamente objetos nuevos con prefijo `gx_` y un bucket privado `gx-internal-task-files`.

No altera:
- `profiles` ni su restricción de roles.
- `managers`.
- `manager_tasks` ni `creator_tasks`.
- La estructura de `notifications`; únicamente inserta notificaciones nuevas del módulo.
- Las tablas actuales que alimentan el calendario.

Los managers y administradores actuales se incorporan a la nueva membresía usando sus perfiles existentes. Los creadores no se incorporan.

## Acceso

La página independiente es `grayxon-trabajo.html`. Los integrantes operativos nuevos se autentican con correo y contraseña, sin crearles un perfil de manager ni de creador. La función `gx-create-internal-member` permite que un administrador cree esas cuentas y su membresía.

## Calendario y notificaciones

- `portal.html` conserva el calendario actual y añade la lectura de tareas internas visibles para el usuario según RLS.
- Desde Grayxon Trabajo se abre ese calendario existente.
- `sw.js` dirige las notificaciones push del módulo a `grayxon-trabajo.html`.

## Seguridad

- RLS está habilitado en todas las tablas nuevas.
- Las operaciones sensibles de avance, revisión y conversión de solicitudes usan funciones con validación de usuario y permisos.
- La asignación se valida contra miembros internos activos.
- Los archivos se guardan en un bucket privado y se sirven con URL firmada.
- La función de creación de integrantes valida la sesión y el rol de administrador desde `profiles`; no confía en metadatos editables del usuario.

## Estado de despliegue

- Código: rama `feature/grayxon-trabajo`.
- Punto de partida: `main` en `47ca486eba78b63e63eef36313f4be3f40700bda`.
- Respaldo de código: `backup/pre-grayxon-trabajo-2026-11-09`.
- Supabase: proyecto `vxyakhelhuikutepdjyn`.
- La migración todavía no se ha aplicado a Supabase.
- La Edge Function todavía no se ha desplegado.
- No se creó una rama de base de datos de pago.
- No se ha obtenido un backup completo restaurable de los datos preexistentes; esta implementación evita modificar sus tablas y estructuras.

## Revisión antes de producción

1. Revisar la migración y sus políticas RLS.
2. Probar la creación de miembros, tareas y solicitudes con cuentas de prueba.
3. Verificar que un operativo no pueda leer solicitudes o tareas ajenas ni asignar tareas.
4. Verificar la aprobación administrativa y el regreso a progreso cuando se solicitan correcciones.
5. Verificar archivos privados, notificaciones y calendario.
6. Ejecutar los asesores de seguridad y rendimiento después de aplicar la migración.
7. Desplegar a producción únicamente después de validar los puntos anteriores.

## Reversión

El archivo `supabase/rollback/20261109000000_grayxon_trabajo.sql` elimina exclusivamente los objetos de Grayxon Trabajo. Es destructivo para los datos del módulo y no debe ejecutarse sin exportar antes las tareas, solicitudes, comentarios, actividad y archivos creados.
