GRAYXON GROUP — v66

Cambios de esta versión

1) Panel de manager — creadores
- Cada creador muestra su avatar_url de profile_details cuando existe.
- Se eliminó del panel del manager el botón “Tareas” asociado a cada creador.
- El creador ahora tiene únicamente dos acciones: “👤 Ver perfil” y “🎯 Misiones”.
- “Ver perfil” queda dedicado exclusivamente a la información del creador.
- “Mis tareas” sigue siendo la sección de tareas que el administrador asigna al manager mediante public.manager_tasks.
- La foto del creador se carga sin lazy-loading para mejorar compatibilidad en Safari/iPhone y con referrerpolicy no-referrer.

2) Tareas
- Las tareas del sistema de managers siguen usando public.manager_tasks.
- No se crea ni se muestra una nueva tarea para el creador desde este panel.
- La tabla public.creator_tasks creada en v65 queda sin uso en la interfaz actual; no es necesario ejecutar nuevamente su SQL para v66.

3) Seguridad
- No se modifican RLS, triggers ni la lógica de asignación de managers.
- Se conserva la separación de roles: admin / manager / creator.

SUPABASE

No hay SQL nuevo obligatorio para v66.
El GRANT de public.manager_tasks aplicado previamente se conserva.
No ejecutes de nuevo migraciones antiguas para “reconstruir” el sistema.

GITHUB

Subir los archivos de v66 conservando la estructura existente.
No subas el ZIP como archivo dentro del repositorio.
