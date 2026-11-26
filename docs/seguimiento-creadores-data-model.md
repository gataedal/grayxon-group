# Diseño de datos — Seguimiento de creadores

Estado: diseño técnico en revisión; **no aplicado a Supabase**.  
Fecha: 2026-11-26.  
Objetivo: habilitar Seguimiento dentro de Gestión sin duplicar perfiles, teléfonos, autenticación ni entregas existentes.

## 1. Decisiones de arquitectura

- Reutilizar `profiles`, `teams`, `managers` y `profile_details` como fuente maestra de creadores, asignación y teléfono.
- No crear una tabla de contactos con teléfonos. El número permanece en `profile_details.phone`.
- No reutilizar `gx_tasks` ni `gx_creator_deliveries` para los seguimientos operativos de creadores: son flujos distintos.
- Cada importación conserva su archivo de origen, autor, equipo/manager, periodo solicitado, periodo real cubierto, formato detectado y estado de procesamiento.
- Cada resultado por creador es una evaluación inmutable ligada a una importación y a un snapshot de parámetros.
- Las reimportaciones no borran resultados previos. Una nueva versión queda enlazada a la importación sustituida y se marca explícitamente como vigente o reemplazada.
- Las evaluaciones y sus importaciones son inmutables. Los managers pueden gestionar y actualizar los planes de trabajo de sus creadores asignados; cada avance se conserva como registro histórico. Los contactos, observaciones y recordatorios mantienen su historial.
- Las comparaciones entre evaluaciones se permiten solo cuando las coberturas temporales son comparables y la fuente ofrece granularidad suficiente.

## 2. Entidades propuestas

### `gx_creator_followup_imports`

Una fila por archivo importado.

Campos propuestos:
- `id` UUID.
- `uploaded_by` UUID → `auth.users`.
- `manager_id` UUID → `managers.id`, nullable para importaciones administrativas.
- `team_id` UUID → `teams.id`, nullable si la administración carga un conjunto transversal.
- `file_name`, `storage_bucket`, `storage_path`, `file_sha256`.
- `selected_start_date`, `selected_end_date`: rango que pidió evaluar.
- `source_start_date`, `source_end_date`: rango que realmente cubre el reporte, si se puede identificar.
- `source_granularity`: `daily`, `period_aggregate`, `unknown`.
- `status`: `uploaded`, `processing`, `processed`, `needs_daily_data`, `failed`, `superseded`.
- `supersedes_import_id` UUID nullable.
- `created_at`, `processed_at`, `error_summary`.

Restricciones:
- La fecha inicial debe ser menor o igual a la final.
- El manager solo puede importar datos de creadores asignados a él al momento de la importación.
- Un archivo repetido (mismo SHA-256 y mismo ámbito/periodo) debe detectarse y no duplicar actividad silenciosamente.
- Guardar el archivo original en Storage privado; nunca depender de una URL pública.

### `gx_creator_followup_evaluations`

Una fila por creador y versión de importación.

Campos propuestos:
- `id` UUID.
- `import_id` UUID → importación.
- `creator_user_id` UUID → `profiles.id`.
- `creator_username_snapshot`, `team_id_snapshot`, `manager_id_snapshot`: contexto al evaluar, para que el historial siga explicable si cambia de equipo.
- `join_date_snapshot` date.
- `evaluated_start_date`, `evaluated_end_date`.
- `evaluable_days` integer.
- `valid_live_days` numeric, nullable si la fuente no lo ofrece.
- `live_seconds` bigint, nullable si no se puede normalizar.
- `diamonds` bigint, nullable.
- `target_valid_days`, `target_live_seconds`, `valid_days_pct`, `live_hours_pct`.
- `classification`: `high_risk`, `observation`, `on_track`, `early_review`, `not_evaluable`.
- `raw_metrics` JSONB: campos fuente y trazabilidad de normalización.
- `created_at`.

Restricciones:
- Una evaluación por creador/importación (`unique(import_id, creator_user_id)`).
- No calcular porcentajes ni clasificaciones si faltan métricas necesarias.
- No convertir un agregado mensual en datos diarios ni inferir actividad para subrangos.
- Los porcentajes y metas usados se calculan al procesar y se conservan como snapshot; cambios posteriores de parámetros no reescriben historia.

### `gx_creator_followup_parameters`

Configuración versionada por administración.

Campos propuestos:
- `id`, `version`, `monthly_live_hours` (inicial 90), `monthly_valid_days` (inicial 22).
- `early_review_min_evaluable_days` (inicial 5).
- `high_risk_threshold_pct` (inicial 50), `observation_threshold_pct` (inicial 80).
- `consistency_hours_per_day` (inicial 2.5), `consistency_days_per_week` (inicial 6).
- `timezone` (inicial `America/Bogota`), `active`, `created_by`, `created_at`.

La recomendación de constancia (2 h 30 min por día, 6 días por semana) no se mezcla con las metas mensuales de 90 horas y 22 días válidos.

### `gx_creator_followup_contacts`

Registro de cada intento o contacto confirmado.

Campos propuestos:
- `id`, `creator_user_id`, `manager_id`, `evaluation_id` nullable.
- `contact_status`: `pending_contact`, `initiated`, `confirmed`, `pending_response`, `responded`.
- `channel` (WhatsApp inicialmente), `message_text`, `opened_at`, `confirmed_at`, `responded_at`.
- `created_by`, `created_at`.

Abrir WhatsApp solo guarda que se abrió/preparó el enlace si se decide registrar ese evento; **nunca** marca el mensaje como enviado ni contacto confirmado. El manager debe confirmar manualmente.

### `gx_creator_followup_reminders`

Recordatorios asociados al creador y al manager.

Campos propuestos:
- `id`, `creator_user_id`, `manager_id`, `contact_id` nullable, `evaluation_id` nullable.
- `scheduled_at` timestamptz; `timezone` (default `America/Bogota`).
- `status`: `pending`, `responded`, `rescheduled`, `no_response`, `under_review`, `completed`, `cancelled`.
- `note`, `created_by`, `created_at`, `updated_at`.
- Fecha predeterminada: día siguiente a la confirmación del contacto, 20:00 hora de Bogotá; editable por el manager.

### `gx_creator_followup_notes`

Observaciones/compromisos cronológicos.

Campos propuestos:
- `id`, `creator_user_id`, `manager_id`, `evaluation_id` nullable, `contact_id` nullable.
- `note_type`: `observation`, `commitment`, `response`, `review`.
- `body`, `created_by`, `created_at`, `updated_at`, `edited_by`.

Las notas no se eliminan al cerrar un periodo o al pasar un caso a revisión. Las ediciones deben conservar autor y fecha de última edición; si se requiere auditoría completa de cambios, agregar tabla de versiones en la fase de implementación.

### `gx_creator_action_plans` y `gx_creator_action_plan_updates`

Plan individual por creador, separado del reporte de evaluación.

Plan:
- `id`, `creator_user_id`, `manager_id`, `title`, `objective`, `success_criteria`.
- `status`: `active`, `paused`, `completed`, `cancelled`.
- `start_date`, `target_date`, `created_by`, `created_at`, `updated_at`.

Actualizaciones:
- `id`, `plan_id`, `evaluation_id` nullable, `progress_summary`, `proposed_changes`, `status` (`draft`, `pending_manager_review`, `approved`, `rejected`).
- `created_at`, `reviewed_by`, `reviewed_at`, `review_note`.

Las evaluaciones futuras pueden generar una propuesta de actualización del plan, pero no modificarlo automáticamente. El manager revisa y aprueba antes de registrar cambios. Esto preserva la decisión acordada.

## 3. Fórmula y reglas de evaluación

1. Calcular el rango evaluable como intersección entre el periodo seleccionado y el periodo en que el creador ya pertenecía a Grayxon.
2. No contar fechas futuras ni días fuera de la cobertura real del archivo.
3. Calcular días del mes calendario y días evaluables; la meta proporcional inicial será `meta_mensual × días_evaluables / días_del_mes`. La regla exacta de redondeo de días válidos debe definirse antes de activar el cálculo (se recomienda conservar el objetivo decimal y mostrar el equivalente claramente, sin redondear hacia arriba silenciosamente).
4. Horas: guardar segundos y comparar contra la meta proporcional en segundos.
5. Clasificación:
   - Menos de 5 días evaluables → revisión temprana.
   - Si horas **o** días están por debajo del 50 % → riesgo alto.
   - Si horas **o** días están por debajo del 80 % → en observación.
   - Ambos indicadores en 80 % o más → en línea.
   - Si no hay datos válidos suficientes para uno de los indicadores → no evaluable, sin castigar al creador.
6. Mostrar faltantes con mínimo cero y distinguir meta alcanzada/superada.
7. La constancia diaria/semanal es una recomendación independiente, no una meta prorrateada equivalente a 90 horas.

## 4. Fuente y granularidad: bloqueo conocido

Los dos Excel examinados tienen distinta utilidad:
- El archivo de datos de TikTok contiene una fila agregada por creador para el periodo informado (por ejemplo, 1–23 de noviembre), no actividad diaria.
- El reporte de seguimiento del equipo incluye columnas manuales de compromiso, observación y plan de acción; es una referencia de flujo, no una fuente diaria de actividad.

Por tanto, un agregado del 1 al 23 no permite calcular correctamente el 1 al 3, 1 al 7 ni cualquier subrango. La importación debe detectar esta situación y marcar `needs_daily_data` si el rango solicitado no coincide con la cobertura real del agregado. No se deben prorratear diamantes, horas ni días válidos.

Antes de habilitar evaluaciones por periodos cortos, probar un export de TikTok con filas diarias por creador o diseñar snapshots consecutivos con diferencias verificadas, control de duplicados y tratamiento de correcciones retroactivas.

## 5. Teléfono y permisos

- Fuente única del teléfono: `profile_details.phone`.
- No añadir `phone` a ninguna tabla de Seguimiento.
- La edición por manager debe implementarse mediante una RPC estrecha que valide en servidor que el usuario autenticado es manager activo y que `profiles.manager_id` del creador coincide con `current_manager_id()`; admin puede editar cualquier creador.
- No ampliar una policy general de UPDATE de `profile_details` para todos los managers.
- RLS en las tablas nuevas debe limitar al manager a su equipo actual y al admin a todos los equipos. Además, las operaciones de escritura deben validar el manager/creador en triggers o RPCs para evitar suplantación mediante IDs enviados desde el navegador.
- Cuentas con rol creator no deben tener permisos sobre las tablas de Seguimiento.
- No se debe conceder acceso a miembros internos `gx_internal_members` automáticamente: este módulo usa el modelo de roles de creadores/managers/admin acordado.

## 6. Storage y operación

- Bucket privado dedicado para reportes originales (por ejemplo `gx-creator-followup-reports`).
- Guardar hash SHA-256, nombre y ruta del objeto.
- El borrado/retención de archivos se definirá con política explícita; no borrar fuentes necesarias para explicar evaluaciones históricas.
- El backup de Storage es independiente del backup lógico de Postgres y debe verificarse por separado.

## 7. Orden de implementación y criterios de aceptación

1. Confirmar el formato diario real de TikTok o definir claramente la limitación de agregados.
2. Crear migración SQL versionada en rama; revisar índices, constraints, triggers, grants, RLS y RPCs.
3. Probar migración en proyecto Supabase de pruebas/restauración, nunca directamente en producción mientras no exista backup recuperable.
4. Implementar importación privada, hash y detección de duplicados.
5. Implementar parser con validación de encabezados y mapeo de columnas; errores visibles y sin guardar resultados parciales.
6. Implementar cálculo puro con pruebas para periodos 3/7/15 días, mes completo, alta reciente, límites de mes, datos ausentes y reimportación.
7. Implementar contactos/WhatsApp, confirmación manual y recordatorios.
8. Implementar observaciones/compromisos e historial mensual.
9. Implementar planes de acción y propuestas de actualización pendientes de aprobación.
10. Implementar la vista de administración, filtros por manager/equipo y parámetros versionados.
11. Añadir la vista **Planes de acción** separada de **Multimedia** en entregas del creador, mostrando inicialmente el informe y el aviso acordado: “Si tienes dudas o sugerencias, contacta a tu manager”.
12. Pruebas RLS por admin, manager asignado, manager no asignado y creator; pruebas de persistencia y responsive.

## 8. Riesgos que deben resolverse antes de activar

- Confirmar si el reporte de TikTok puede exportarse con granularidad diaria.
- Definir el redondeo visible de metas fraccionarias de días válidos.
- Definir el mecanismo de ejecución/envío de recordatorios (la fila en base de datos por sí sola no genera una notificación).
- Confirmar el proceso de backup/restauración de Postgres y Storage.
- Confirmar si la vista Planes de acción debe publicarse a todos los creadores de inmediato o por plan/periodo, manteniendo el aviso de contacto con manager.
