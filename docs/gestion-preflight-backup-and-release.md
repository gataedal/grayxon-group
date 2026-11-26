# Preflight de implementación y recuperación — Gestión / Seguimiento

Estado: preparación; **no ejecutado contra producción**.  
Proyecto Supabase de referencia: `vxyakhelhuikutepdjyn`.  
Rama exclusiva: `feature/gestion-module-2026-11-26`.

## Límite de alcance

- No modificar archivos ni funcionalidades fuera del módulo Gestión/Seguimiento.
- No fusionar esta rama con `main`, publicar el portal ni aplicar migraciones en producción durante la preparación.
- No crear buckets ni políticas en el proyecto real hasta completar y verificar los respaldos.
- La rama `backup/pre-gestion-2026-11-26` es un punto de restauración de **código solamente**. No es respaldo de PostgreSQL ni de Storage.

## Qué debe respaldarse antes de activar

### 1. PostgreSQL

La exportación lógica debe guardarse fuera del repositorio, en una ubicación privada y con acceso restringido. Instalar Supabase CLI y Docker Desktop. Obtener la cadena de conexión desde **Supabase Dashboard → Connect** y mantenerla en una variable de entorno o gestor de secretos; no escribirla en comandos guardados, archivos del repo, tickets ni capturas.

Con Supabase CLI v3:

```powershell
$env:DB_URL = Read-Host "Pega la cadena de conexión PostgreSQL"
supabase db dump --remote="$env:DB_URL" -f roles.sql --role-only
supabase db dump --remote="$env:DB_URL" -f schema.sql
supabase db dump --remote="$env:DB_URL" -f data.sql --use-copy --data-only
Remove-Item Env:DB_URL
```

La exportación de esquema y datos debe incluir también los objetos personalizados de los esquemas gestionados que se hayan creado en el proyecto (por ejemplo, políticas y triggers propios de `storage`); revisar la configuración del motor de diff de Supabase y conservar una exportación/revisión específica de `auth,storage` si corresponde. El dump estándar excluye esquemas gestionados como `auth` y `storage`; no asumir que el SQL por sí solo respalda archivos binarios.

### 2. Storage (archivos binarios)

El respaldo de PostgreSQL conserva metadatos, pero **no copia los objetos almacenados mediante Storage API**. Antes de cualquier cambio:
- Inventariar buckets, visibilidad, límites, MIME types, políticas y cantidad/tamaño de objetos.
- Exportar/c copiar los objetos de cada bucket a almacenamiento externo privado, manteniendo bucket y ruta originales.
- Generar manifiesto con bucket, ruta, tamaño y SHA-256 de cada archivo.
- Comparar recuentos y checksums después de la copia.
- No borrar ni sobrescribir objetos de producción durante la preparación.

La restauración debe probarse en un proyecto Supabase separado, nunca sobre el proyecto activo.

### 3. Verificación de recuperación

No basta con que los archivos existan. En un proyecto de prueba independiente:
- Restaurar roles, esquema y datos con el procedimiento compatible con la versión de CLI/Postgres.
- Reponer los objetos de Storage y sus metadatos.
- Verificar login, perfiles, roles, asignaciones, RLS, archivos, funciones, triggers y flujos existentes.
- Registrar fecha, versión de CLI, destino de prueba, recuentos y resultado.
- Mantener producción intacta hasta que la restauración de prueba sea satisfactoria.

## Cambios preparados para Seguimiento (pendientes de implementar)

**La migración defectuosa anterior fue retirada.** En la rama de trabajo ya hay dos migraciones nuevas: esquema aislado de importaciones/evaluaciones, parámetros, contactos, notas, recordatorios y planes de acción; y políticas RLS de escritura para operaciones de manager. Se añadió bucket privado, RPC transaccional para guardar el archivo y sus evaluaciones, guardado desde la interfaz y consulta de historial. Estas migraciones aún no se han aplicado a Supabase; solo deben considerarse candidatas hasta que pasen las pruebas automatizadas y la revisión de permisos.

## Secuencia segura de activación y prueba

1. Completar respaldos de PostgreSQL y Storage y probar su restauración fuera de producción.
2. Revisar la migración completa y contrastarla con el esquema/políticas reales inmediatamente antes de aplicarla.
3. Aplicar únicamente la migración de Seguimiento en un proyecto Supabase de staging/prueba.
4. Probar con cuentas reales de prueba: admin, manager A, manager B y creador; verificar aislamiento cruzado y lectura de historial.
5. Probar carga de Excel, archivo repetido, archivo inexistente, periodo mixto, filas sin correspondencia, datos inválidos, fallo a mitad de lote y rollback transaccional.
6. Verificar que ninguna consulta ni política nueva permite al manager ver datos del otro manager o acceder a herramientas internas.
7. Solo después de aprobación explícita, planear la activación en producción con respaldo reciente y rollback probado.

## Bloqueos actuales

- No hay evidencia de un respaldo lógico descargado y verificado.
- No hay evidencia de copia externa de objetos Storage ni de restauración de prueba.
- Las migraciones nuevas aún no tienen resultado de CI confirmado y no se han aplicado a Supabase.
- El bucket de Seguimiento aún no existe en producción.
- El flujo de persistencia ya está implementado en la rama, pero todavía debe pasar pruebas automatizadas y pruebas reales con cuentas aisladas. Contactos, notas, recordatorios y planes de acción ya tienen formularios y guardado desde Gestión. El envío de notificaciones automáticas para recordatorios sigue pendiente; por ahora quedan registrados y visibles en el módulo.

## Referencias oficiales

- Supabase CLI — `db dump`: https://supabase.com/docs/reference/cli/introduction
- Supabase — Backup and Restore using the CLI: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Supabase — Database Backups (incluye la aclaración de que los objetos Storage no están incluidos): https://supabase.com/docs/guides/platform/backups
