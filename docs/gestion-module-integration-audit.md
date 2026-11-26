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
3. **Seguimiento** — integrar la especificación «Seguimiento creadores»: importación de reportes TikTok, evaluación por período, contactos/WhatsApp, observaciones, compromisos, recordatorios e historial.
4. **Reportes** — sección prevista y acordada; queda creada/preparada en la estructura, pero su contenido y funcionamiento se definirán después. No se debe inventar ahora un flujo de informes del trabajo del manager.

En Seguimiento, el manager puede crear planes de acción por creador con objetivos. En cargas posteriores, el sistema compara el progreso con esos objetivos y prepara una actualización para revisión del manager antes de registrarla. El historial se organiza por mes.

En el área de entregas del creador, mantener separadas las vistas «Multimedia» y «Planes de acción». Los planes se presentan inicialmente como informe y con el aviso: «Si tienes dudas o sugerencias, contacta a tu manager».

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
4. Definir más adelante el contenido de la sección Reportes, tal como quedó acordado. No volver a solicitar al usuario que decida si Reportes forma parte de Gestión: ya está definido.

## 8. Estado

- [x] Punto de retorno de código en GitHub.
- [x] Rama de desarrollo independiente.
- [x] Auditoría inicial de módulo, perfiles, equipos y políticas.
- [x] Inspección de los dos Excel de referencia.
- [x] Renombre inicial de la identidad visible a Gestión en la rama de desarrollo.
- [ ] Respaldo lógico verificable de base de datos.
- [ ] Respaldo de objetos Storage.
- [ ] Preparar la sección Reportes sin contenido funcional hasta que se configure posteriormente.
- [ ] Diseño final de tablas/RLS.
- [ ] Implementación de Seguimiento.
- [ ] Pruebas de integración y despliegue.


## 10. Avance de implementación en rama de desarrollo

- Se añadió la navegación integrada de Gestión con las secciones Tareas, Solicitudes, Seguimiento y Reportes, conservando el acceso a Resumen y las herramientas administrativas existentes.
- Seguimiento y Reportes tienen por ahora una pantalla de entrada explícita. No se presentan como funcionalidades terminadas ni se guardan datos ficticios.
- La pantalla de Seguimiento informa que los archivos agregados no permiten reconstruir periodos arbitrarios cuando no contienen filas diarias.
- Se verificó el flujo actual de entregas a creadores: utiliza las tablas `gx_creator_deliveries` y `gx_creator_delivery_files`, con publicación después de aprobación. La futura vista Planes de acción debe quedar separada de Multimedia y reutilizar el acceso del portal, sin mezclar ambos tipos de entrega.
- La consulta de estructura y migraciones de Supabase fue de solo lectura. No se aplicaron migraciones, no se alteraron tablas ni políticas, y no se escribieron registros ni archivos de Storage.
- Próximo paso técnico: diseñar y revisar las tablas de importaciones, evaluaciones por periodo, parámetros, contactos, observaciones, recordatorios y planes de acción; luego preparar SQL versionado en esta rama y probarlo en un entorno recuperable antes de aplicarlo a producción.


## 11. Modelo de datos y cálculo inicial

- Se añadió `docs/seguimiento-creadores-data-model.md` con el diseño de importaciones, evaluaciones inmutables, parámetros versionados, contactos, recordatorios, notas y planes de acción.
- El diseño reutiliza `profile_details.phone` como fuente única del teléfono; no crea una agenda paralela. La edición por manager queda condicionada a una RPC estrecha que valide la asignación del creador.
- Se añadió `grayxon-followup-calculations.js` como módulo puro, separado de DOM y Supabase, y su archivo de pruebas `tests/grayxon-followup-calculations.test.js`.
- El cálculo prorratea metas por días evaluables y calendario de cada mes, contempla incorporaciones recientes y periodos que cruzan meses, conserva metas decimales y devuelve faltantes nunca negativos.
- Los agregados que no coinciden exactamente con el periodo seleccionado se bloquean como `needs_daily_data`; no se inventan valores diarios.
- Se cargó el helper en la página de Gestión, pero todavía no está conectado a la importación Excel ni a escrituras de base de datos.
- Se ejecutó una comprobación local con Node.js para los casos principales: rango de 7 días, ingreso reciente, agregado no divisible, riesgo alto, métrica faltante y periodo que cruza dos meses. Resultado: pruebas satisfactorias.
- El diseño de datos sigue siendo una propuesta; no existe migración aplicada ni cambio de esquema en Supabase.


## 12. Lector de Excel: primera implementación aislada

- Se añadió `grayxon-followup-import.js`, un parser de previsualización que identifica las columnas del Excel real de TikTok: periodo, ID, usuario, grupo, agente, incorporación, días desde incorporación, diamantes, duración LIVE y días válidos.
- El parser convierte duraciones como `130h 55min 50s` a horas decimales, normaliza nombres de usuario y omite duplicados dentro del archivo dejando advertencias.
- Se exige que el periodo seleccionado coincida exactamente con el periodo acumulado del archivo para habilitar evaluación. Si el manager elige un subperiodo, el parser devuelve una restricción explicativa y no habilita cálculos.
- Se añadió `tests/grayxon-followup-import.test.js` con casos del formato real: lectura de filas, duración, métricas y bloqueo de subperiodos.
- El parser se carga en la página de Gestión, pero aún no hay selector de archivo ni previsualización visible. Tampoco se ha incorporado la librería XLSX/SheetJS al HTML: se deja pendiente hasta seleccionar y validar una dependencia concreta, evitando introducir un CDN no auditado.
- No se ha conectado a Supabase ni persiste archivos o resultados.

## 13. Hallazgo de autorización que bloquea la integración de managers

- La página actual de Gestión valida el acceso exclusivamente consultando `gx_internal_members` por `auth.uid()`.
- El rol `manager` de `profiles` no concede por sí mismo acceso a esta página. Por tanto, no se debe asumir que los managers actuales pueden entrar en Gestión.
- No se modificará esta validación de forma general: primero hay que separar el acceso al área operativa interna (Tareas/Solicitudes/Equipo) del acceso a Seguimiento para managers, y mantener RLS en las tablas existentes.
- La siguiente implementación debe permitir que un manager autorizado entre a la sección Seguimiento sin concederle automáticamente acceso a tareas internas, solicitudes internas, áreas, actividad ni calendarios del personal.
- Este control de acceso debe resolverse antes de mostrar el flujo de importación a managers o permitirles consultar datos de sus creadores.


## 14. Acceso de manager separado del equipo interno

- Se implementó en la rama una ruta de autenticación independiente para cuentas manager del portal.
- La validación exige: perfil `profiles` con `role='manager'` y `active=true`, `manager_id` presente, y registro correspondiente en `managers` con el mismo `id`, `user_id` autenticado y `active=true`.
- La navegación de manager se limita a Seguimiento y Reportes.
- Para cuentas manager no se ejecuta `loadData()`: no se consultan tareas internas, solicitudes, miembros internos, departamentos, actividad ni calendario.
- Se conserva sin cambios la ruta existente de `gx_internal_members` para personal interno y administración.
- El acceso a Seguimiento es únicamente una puerta de entrada en esta etapa: las consultas de creadores, importaciones y acciones aún no están habilitadas. La autorización real de datos deberá implementarse y probarse también mediante RLS/RPC en Supabase; ocultar pestañas no se considera seguridad suficiente.
- No se han modificado políticas ni tablas de Supabase.

## 15. Pendientes técnicos actualizados

- [x] Ruta frontend separada para manager, sin cargar las consultas de Gestión interna.
- [ ] Ejecutar los tests del parser y del cálculo en un entorno Node/CI con los archivos reales del repositorio.
- [ ] Añadir y validar una dependencia XLSX de versión fijada, antes de activar el selector de archivos.
- [ ] Diseñar RLS/RPC específicas para importaciones y evaluaciones por manager y admin.
- [ ] Construir previsualización visible y confirmación de importación.


## 16. Previsualización funcional de Excel

- Se añadió la librería SheetJS fijada a la versión 0.18.5 en la página integrada de Gestión.
- La sección Seguimiento ya muestra selector de archivo Excel y campos Desde/Hasta. El botón Analizar archivo lee el libro en el navegador sin subirlo ni guardarlo.
- El parser identifica usuarios y métricas, omite duplicados y reporta advertencias. Después consulta `profiles` con la sesión autenticada; el manager recibe únicamente los creadores que las políticas existentes de `profiles` le permiten consultar, mientras administración conserva su alcance actual.
- Los usuarios importados se vinculan con `tiktok_username` o `username`. Los no vinculados quedan marcados para revisión y no se asignan a un perfil por aproximación.
- La vista previa usa el motor de evaluación existente para mostrar clasificación, con los valores iniciales acordados (90 horas, 22 días, 5 días mínimos y umbrales 50/80). Si el rango seleccionado no coincide con el agregado, el motor devuelve `needs_daily_data`.
- Se añadió diseño responsive para escritorio y móvil.
- Se preparó `supabase/migrations/20261126180000_gx_creator_followup_core.sql` con tablas de importaciones/evaluaciones y RLS basada exclusivamente en `public.is_admin()` y `public.current_manager_id()`. Es un archivo de migración en GitHub, no aplicado.
- No se añadieron roles ni permisos generales nuevos. No se modificaron policies de tablas existentes ni datos de Supabase. El archivo Excel se procesa localmente en el navegador y todavía no se persiste.

## 17. Validaciones pendientes antes de persistir

- Ejecutar y revisar el workflow de GitHub Actions con los archivos reales.
- Probar el formato del Excel original en el navegador con la versión fijada de SheetJS.
- Revisar la migración SQL con el esquema actual y ejecutar pruebas RLS para admin, manager asignado, manager no asignado y creator en un entorno de pruebas/restauración.
- Implementar Storage privado, hash de archivo y persistencia transaccional después de contar con respaldo recuperable.
- Añadir una vista clara para discrepancias entre el usuario de TikTok y los perfiles Grayxon, sin permitir que el manager consulte perfiles fuera de su alcance.


## 18. Endurecimiento y verificación del 26 de noviembre

### CI de frontend y parser
- El workflow `Gestión follow-up checks` terminó con conclusión `success` en el commit `f8a6f5b36cb059034029e75b9ef78ad6832ebe9d`.
- Se completaron correctamente los pasos de sintaxis JavaScript, pruebas de cálculos y pruebas del parser Excel.
- La previsualización ahora bloquea archivos con varios periodos mezclados, evita evaluar métricas ambiguas y no enlaza automáticamente usuarios cuando hay más de un perfil coincidente.
- El selector de periodo y los mensajes de previsualización contemplan el caso de periodos mezclados sin intentar calcular resultados parciales.

### Revisión de Supabase en modo solo lectura
- Se confirmó que `public.current_manager_id()` existe, no recibe argumentos y devuelve `uuid`; obtiene el manager activo vinculado al usuario autenticado.
- Se confirmó que `public.is_admin()` existe, no recibe argumentos y devuelve `boolean`; verifica perfil admin activo.
- Se verificaron las tablas `profiles`, `managers`, `teams`, `profile_details` y el flujo existente `gx_creator_deliveries`.
- Las políticas actuales permiten a managers consultar creadores asignados y sus datos de perfil; la actualización de teléfono continúa limitada al propio perfil o administración. No se abrió ninguna política existente.
- Se observó que el esquema de importaciones debía validar también la relación entre manager y equipo seleccionado. Se añadió al SQL de desarrollo un trigger de validación que impide a managers registrar importaciones de otro manager y evita asociar un equipo a un manager distinto.
- La migración sigue siendo un borrador versionado en la rama; no fue aplicada. No se crearon tablas, funciones, triggers, buckets ni políticas en Supabase.

### Bloqueos de seguridad y recuperación
- El respaldo Git de la rama `backup/pre-gestion-2026-11-26` solo protege el código. No sustituye un respaldo lógico de PostgreSQL ni una copia independiente de Storage.
- Antes de aplicar SQL o habilitar persistencia se requiere obtener y verificar ambos respaldos y documentar cómo restaurarlos.
- El archivo Excel fuente deberá guardarse en un bucket privado, con políticas de Storage restringidas y rutas que no permitan acceso cruzado entre managers. El bucket no se ha creado.
- Las evaluaciones deben seguir siendo snapshots históricos no editables desde el cliente; cualquier re-procesamiento debe ser una operación explícita y auditable.


## 19. Preparación de persistencia y preflight de despliegue

- Se amplió el borrador de migración para guardar metadatos del archivo original (bucket, ruta privada, tamaño, MIME y SHA-256), manteniendo el límite de 20 MB.
- Se añadió el bucket privado propuesto `gx-followup-imports` con lectura de objetos limitada a importaciones registradas y al alcance de admin/manager. La carga inicial queda bajo una carpeta con el UID del usuario autenticado.
- Se añadió la RPC `gx_save_creator_followup_import` para registrar archivo y evaluaciones en una sola transacción. Verifica sesión, ámbito del manager, ruta del objeto, existencia del archivo, duplicado por hash/equipo/periodo y consistencia de filas; si falla una evaluación, se revierte toda la operación.
- El cliente conserva solo permiso de lectura en las tablas nuevas; la persistencia queda centralizada en la RPC. Se mantienen los helpers actuales y no se abren permisos de tablas existentes.
- Se añadió `docs/gestion-preflight-backup-and-release.md` con el procedimiento de respaldo lógico, respaldo independiente de Storage, verificación de restauración y secuencia de activación aislada. Las instrucciones distinguen expresamente que el dump de PostgreSQL no incluye los archivos binarios de Storage.
- El workflow ahora también se dispara cuando cambia la migración de Seguimiento, de modo que la preparación SQL no queda fuera del circuito de validación de Gestión.
- **No se ha creado el bucket, no se ha aplicado la migración, no se han modificado políticas reales, no se han cargado archivos y no se ha desplegado el portal.**
- La persistencia sigue pendiente de validación en un proyecto Supabase de staging y de completar respaldos recuperables. El hash se usa como identificador de duplicados aportado por el cliente; no se presenta como verificación criptográfica independiente del contenido en el servidor.


## 18. Verificación adicional de RLS para la entrada de managers (26/11/2026)

Consulta de solo lectura a `pg_policies` en el proyecto de producción:

- `profiles`: el usuario puede leer su propio perfil; los managers tienen además lectura de creadores asignados mediante `current_manager_id()`.
- `managers`: existe una política de lectura del propio registro mediante `id = current_manager_id()`.
- `gx_internal_members`: cada usuario puede leer su propia membresía; administración conserva su política de gestión.

Esto confirma que las dos consultas de validación del acceso manager (perfil propio y registro manager propio) tienen políticas SELECT compatibles en el esquema observado. No se cambió ninguna política. Esta comprobación no equivale a una prueba integral de sesión en navegador ni habilita todavía lectura/escritura de Seguimiento.

## 19. Retiro de migración defectuosa y validación automatizada

- La migración SQL inicial de Seguimiento se retiró de la rama de feature porque contenía sintaxis truncada/duplicada. No debe aplicarse ni recuperarse como base de despliegue.
- El workflow de Gestión ahora instala `pglast` en el runner efímero de GitHub Actions y analiza sintácticamente cada archivo `supabase/migrations/*.sql`, además de las pruebas JavaScript existentes.
- Esta validación SQL es sintáctica; no demuestra compatibilidad semántica con el esquema real ni sustituye las pruebas RLS y transaccionales en PostgreSQL temporal.
- La eliminación de la migración no altera el proyecto Supabase. Consulta de solo lectura posterior: 0 tablas, 0 políticas y 0 bucket de Seguimiento.
