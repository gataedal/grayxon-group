# Reconstrucción aislada: Entrenamientos en vivo v2

## Alcance innegociable
- Solo el módulo de Entrenamientos en vivo del portal Grayxon.
- No modificar entrenamientos grabados, otros módulos, navegación general ni datos existentes.
- No ejecutar migraciones destructivas ni cambiar/reiniciar el Jitsi de producción durante desarrollo.
- Trabajar en `rebuild-live-training-v2-isolated`; publicar solo tras pruebas y revisión.

## Hallazgos iniciales confirmados
- El frontend integrado selecciona `GRAYXON_LIVE_PROVIDER = 'jitsi'` y usa `generate-jitsi-jwt`.
- Existe una ruta alternativa JaaS en el mismo archivo; hay que verificar que no se use por accidente.
- La función desplegada v9 calcula `moderator = profile.role === "admin" || training.created_by === userId` y construye `context.user.moderator` y `context.user.affiliation`.
- En prueba real, un creador invitado obtuvo controles de moderador y pudo expulsar participantes. El comportamiento observado contradice la matriz esperada y no se puede dar por resuelto.
- La función de finalización del frontend intenta `endConference` y además expulsar a todos los participantes. Eso requiere una protección explícita y una verificación de autorización antes de ejecutar la acción.

## Matriz de roles objetivo
| Actor | Entrar | Moderar participantes | Finalizar para todos |
|---|---|---|---|
| Creador de la reunión (manager o admin) | Sí, si autorizado | Sí | Sí |
| Administrador Grayxon | Sí, con acceso administrativo | Sí | Sí |
| Manager no creador | Solo según audiencia/equipo | No, salvo promoción explícita | No |
| Creador invitado | Solo según audiencia/equipo | No, salvo promoción explícita | No |

El administrador Grayxon no debe perder privilegios al entrar a una reunión creada por otra persona. La autoría de la reunión y el rol global de administrador son capacidades distintas.

## Fases
1. Mapear todos los puntos de entrada/salida, creación de reuniones, selección de proveedor, generación/validación de JWT, permisos de sala, eventos del iframe, sincronización de anfitrión y actualización del estado en base de datos.
2. Definir un único contrato de roles y una sola ruta de conexión para el proveedor activo.
3. Asegurar que el servidor Jitsi aplique los roles del token y que una cuenta normal no pueda convertirse en moderador por configuración de sala, afiliación, auto-owner ni ruta alternativa.
4. Separar la acción local de abandonar de la acción autorizada de finalizar para todos. Nunca expulsar a todos desde el cliente sin validar el rol.
5. Rehacer el escenario de cámara principal usando un estado estable del anfitrión y eventos verificados; no permitir que el cambio de hablante desplace al anfitrión si la regla del producto es fijarlo.
6. Probar con cuentas independientes (anfitrión, administrador, manager no creador, creador invitado) y con audio/vídeo, permisos, móvil y reconexión.
7. Revisar diff para confirmar que solo se modifica el módulo LIVE y su función de autorización; luego preparar PR sin publicarlo automáticamente.

## Criterios de aceptación
- Un participante normal no puede expulsar, silenciar a otros, cambiar roles ni finalizar la reunión.
- Solo anfitrión y administrador pueden gestionar participantes y finalizar para todos.
- El acceso del manager queda limitado a su audiencia/equipo; el administrador puede entrar a todos los entrenamientos.
- El anfitrión conserva la cámara principal cuando entra otro usuario o habla.
- No se rompen audio, cámara, compartir pantalla, chat, mano levantada, registro de asistencia ni estado EN VIVO.
- Sin cambios fuera del módulo LIVE y sin despliegue a producción antes de pruebas.

## Pendientes de verificación técnica
- Confirmar configuración efectiva de Jicofo y Prosody en el VPS.
- Verificar el JWT real de un participante normal sin exponer secretos ni tokens completos.
- Confirmar qué proveedor, sala y token usa realmente el navegador en una reunión creada por un manager.
- Verificar si las órdenes de moderación que funcionaron procedían del rol de Jitsi o de permisos configurados por el servidor.
