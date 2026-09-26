GRAYXON GROUP — v65

Cambios de esta versión

1) Tareas de creadores
- Nueva tabla public.creator_tasks.
- Un manager solo puede ver y crear tareas para creadores que actualmente estén asignados a ese manager.
- Se mantienen las comprobaciones RLS y current_manager_id().
- Se agrega RPC complete_creator_task() para que el creador pueda marcar una tarea como completada cuando se integre esa vista en su espacio.
- Se agrega RPC notify_creator_task() para notificar al creador cuando su manager le asigna una tarea.
- Admin tiene gestión completa de creator_tasks.

2) Panel de manager
- Cada creador muestra su avatar_url de profile_details cuando existe.
- “Ver creador” queda dedicado a la información del creador.
- Se agrega botón “📋 Tareas” por creador.
- Tareas abre un menú con:
  • Asignar tarea
  • Tareas pendientes
  • Tareas completadas
- Se conserva “🎯 Misiones” como función separada.
- Botones y tarjetas optimizados para móvil.

3) Tareas de managers
- Se conserva la tabla manager_tasks existente.
- El SQL incluye el GRANT INSERT necesario para el formulario administrativo existente:
  GRANT INSERT ON public.manager_tasks TO authenticated;

IMPORTANTE — SUPABASE

Ejecuta UNA SOLA VEZ el archivo:
  grayxon_creator_tasks_v65.sql

No ejecutes de nuevo migraciones antiguas para “reconstruir” el sistema.

No se eliminan triggers ni se desactiva RLS.

GITHUB

Subir al repositorio los archivos de la v65 conservando la estructura existente.
No subas el ZIP como archivo dentro del repositorio.

PRUEBAS RECOMENDADAS

A) Iniciar sesión como manager.
B) Verificar que cada creador muestre su foto si tiene avatar_url.
C) Abrir “Ver creador” y confirmar que solo muestra información.
D) Abrir “Tareas” y probar Asignar tarea.
E) Probar Pendientes y Completadas.
F) Confirmar que un manager no pueda ver tareas de un creador que deje de estar asignado a él.
