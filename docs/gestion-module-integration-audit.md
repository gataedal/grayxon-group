# Auditoría e integración del módulo Gestión

Fecha: 2026-11-26  
Repositorio: `gataedal/grayxon-group`  
Rama de trabajo: `feature/gestion-module-2026-11-26`  
Base de auditoría: commit `456674a7161af9a89a6e8d5587f3189f92a195a7`

## 1. Alcance y seguridad del cambio

- Se conserva el módulo existente `grayxon-trabajo.html/js/css`; no se crea una aplicación ni una autenticación paralela.
- El módulo sigue usando la sesión Supabase compartida del portal.
- La rama `main` no se modifica.
- La rama de respaldo `backup/pre-gestion-2026-11-26` permanece como punto de retorno del código.
- No se han ejecutado escrituras, migraciones ni cambios de políticas en Supabase.
- Este documento y los cambios de nombre son cambios de código en la rama de desarrollo. No constituyen una copia de seguridad de la base de datos ni de Storage.

## 2. Estructura actual confirmada

El módulo actual ya está conectado al portal:
- `grayxon-trabajo-entry.js` agrega la tarjeta de acceso al dashboard.
- `grayxon-trabajo.html` es la vista propia del módulo.
- `grayxon-trabajo.js` maneja tareas, solicitudes, equipo, áreas, actividad y acceso al calendario compartido.
- La autenticación utiliza el cliente Supabase con sesión persistente y valida membresía en `gx_internal_members`.
- Los registros de tareas y solicitudes usan tablas `gx_*` propias del módulo; no se deben mezclar con `manager_tasks` ni `creator_tasks`.

### Estructura de navegación propuesta

**Gestión**
1. **Tareas** — conservar el flujo actual de asignación, conversación, evidencias y aprobación.
2. **Solicitudes** — conservar el flujo actual de solicitud, revisión, conversión en tarea e historial.
3. **Seguimiento** — incorporar el flujo de acompañamiento y seguimiento de creadores descrito en la especificación.

Las vistas de Equipo, Áreas, Actividad y Calendario se mantienen como herramientas administrativas/auxiliares, sin duplicar el calendario global del portal.

## 3. Archivos de reportes revisados

### `Datos del creador 2026_11_24 17_31 UTC+0.xlsx`

- Hoja: `Sheet1`; 84 filas y 41 columnas.
- Incluye usuario, ID estable del creador, grupo, agente, fecha/hora de incorporación, días desde incorporación, diamantes, duración LIVE, días válidos y otras métricas.
- La columna `Periodo de datos` contiene el intervalo agregado `2026-11-01 ~ 2026-11-23`.
- También contiene columnas de acumulado del último mes.
- El archivo no contiene filas diarias por creador ni fechas individuales de cada LIVE.

**Consecuencia:** el archivo permite evaluar el período completo exportado (1–23 de noviembre) con sus métricas agregadas. No permite calcular correctamente subperíodos arbitrarios (por ejemplo, 1–3, 1–7 o 10–15 de noviembre) a partir de sus totales. No se deben distribuir horas/días proporcionalmente ni deducir actividad diaria. Para análisis por fechas personalizadas se necesita un reporte con granularidad diaria o snapshots históricos comparables con reglas verificables de delta e idempotencia.

### `Reporte_Seguimiento_Team_ONYX_24_noviembre_2026.xlsx`

- Hojas: `Seguimiento ONYX` e `Instrucciones`.
- La hoja principal contiene usuario, incorporación, días desde incorporación, días válidos de noviembre, duración, horas decimales, diamantes, compromiso, observaciones de manager y plan de acción.
- Las columnas de compromiso, observaciones y plan de acción son campos manuales.
- Las instrucciones indican que los datos de actividad proceden del reporte TikTok del 1 al 23 de noviembre de 2026 y que no deben modificarse.

**Consecuencia:** es una buena referencia de la información operativa que el manager necesita registrar, pero hoy es una hoja manual. El módulo debe convertir esos campos en registros persistentes, fechados y asociados a responsable/creador, sin conservar una hoja paralela como fuente maestra.

## 4. Modelo actual de perfiles, equipos y permisos

Tablas confirmadas:
- `profiles`: contiene `role`, `team_id`, `manager_id`, `username`, `tiktok_username` y `tiktok_creator_id`.
- `managers`: identifica al manager y vincula su usuario.
- `teams`: vincula equipo con `manager_id`.
- `profile_details`: contiene `phone` y datos complementarios del perfil.
- `gx_internal_members`: membresía interna para el módulo Gestión, independiente de los roles de manager/creador del portal.

Políticas observadas:
- Los managers pueden consultar perfiles de creadores asignados mediante `manager_id = current_manager_id()`.
- Los managers pueden consultar los detalles de perfil de sus creadores asignados.
- En `profile_details`, la política de actualización existente permite actualizar el propio perfil o administración; no se observó una política de actualización para que un manager modifique el teléfono de sus creadores.

**Consecuencia:** reutilizar `profile_details.phone` evita duplicar teléfonos, pero la edición por managers requiere un diseño de autorización específico y acotado (preferiblemente una operación controlada que valide la asignación actual). No se debe abrir UPDATE general sobre todos los perfiles ni relajar RLS de forma global.

## 5. Reglas de cálculo

- Mantener separadas la referencia mensual configurable (90 horas y 22 días válidos) y la recomendación de constancia (2 h 30 min por día, 6 días por semana).
- Las metas parciales deben calcularse solo con el intervalo de fechas realmente evaluable y la fecha de incorporación.
- Los umbrales de clasificación deben ser configurables y aplicarse a los porcentajes del período, sin penalizar a quien no tuvo suficientes días evaluables.
- Si la granularidad del reporte no soporta el rango elegido, bloquear ese análisis parcial y explicar la limitación; nunca inventar una distribución diaria.
- La importación debe guardar el archivo fuente, período, parámetros y resultados inmutables por evaluación. Reimportar el mismo período debe usar una acción explícita de reemplazo/versionado, nunca duplicar silenciosamente.

## 6. Etapas de implementación

### Etapa 1 — Identidad y navegación
- Renombrar la tarjeta y el encabezado de Grayxon Trabajo a Gestión.
- Mantener rutas, autenticación, datos y flujos actuales.
- Añadir Seguimiento como sección solo cuando exista backend seguro y procesamiento validado.

### Etapa 2 — Diseño del modelo y seguridad
- Definir evaluaciones, filas de evaluación, contactos, recordatorios y observaciones.
- Relacionar todo con `profiles.id`, manager responsable y período.
- Preparar RLS para managers de su propio equipo y administración global.
- Resolver actualización segura de `profile_details.phone`.
- No aplicar migraciones hasta contar con respaldo recuperable de base de datos y Storage.

### Etapa 3 — Importación y motor de evaluación
- Validar encabezados, tipos, período y métricas.
- Admitir el agregado 1–23 como un único período.
- Habilitar rangos parciales únicamente cuando el origen aporte granularidad suficiente.
- Evitar duplicados e importaciones repetidas.

### Etapa 4 — Contacto y acompañamiento
- Lista priorizada, teléfono centralizado, mensaje editable y enlace WhatsApp.
- Registrar contacto solo tras confirmación explícita del manager; abrir WhatsApp no significa que el mensaje fue enviado.
- Programar recordatorios con zona horaria `America/Bogota`.
- Guardar observaciones, compromisos y planes de acción con autor y fecha.

### Etapa 5 — Administración y validación
- Vista global por equipo/manager, historial y parámetros configurables.
- Pruebas de permisos, períodos, creadores incorporados durante el rango, reimportación, teléfonos, recordatorios y persistencia.
- Verificar en móvil y escritorio y revisar Supabase Advisors antes de cualquier despliegue.

## 7. Pendientes antes de migrar

1. Obtener y verificar una copia lógica de la base de datos y una copia independiente de los objetos de Storage.
2. Definir si TikTok puede exportar actividad diaria o si se utilizarán snapshots históricos con diferencias verificables.
3. Definir la operación segura para que un manager actualice el teléfono de un creador asignado.
4. Confirmar qué significa “reporte de manager” dentro de Gestión: informe del trabajo del propio manager o reporte de seguimiento de sus creadores. La especificación actual cubre principalmente lo segundo.

## 8. Estado

- [x] Punto de retorno de código en GitHub.
- [x] Rama de desarrollo independiente.
- [x] Auditoría inicial de módulo, perfiles, equipos y políticas.
- [x] Inspección de los dos Excel de referencia.
- [x] Renombre inicial de la identidad visible a Gestión en la rama de desarrollo.
- [ ] Respaldo lógico verificable de base de datos.
- [ ] Respaldo de objetos Storage.
- [ ] Diseño final de tablas/RLS.
- [ ] Implementación de Seguimiento.
- [ ] Pruebas de integración y despliegue.
