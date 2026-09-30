# GRAYXON GROUP — CORRECCIÓN DE PORTADA PÚBLICA Y CIERRE DE SESIÓN

OBJETIVO

* index.html: portada pública oficial de Grayxon Group.
* portal.html: acceso a la aplicación y sus módulos internos.
* inicio-publico-v12.html: redirige a index.html para evitar mostrar la portada anterior.
* manifest.webmanifest: conserva portal.html como destino de inicio de la aplicación instalada.
* app.js: al cerrar sesión, redirige a la portada pública oficial.
* portal.html: actualiza la referencia de app.js para solicitar la versión actualizada.

COMPATIBILIDAD

* El inicio de sesión debe continuar funcionando mediante portal.html#auth.
* Se deben conservar las rutas de autenticación, los accesos según el rol y los enlaces profundos del portal.
* No se deben alterar las funciones existentes de notificaciones, LIVE, formación, creadores, managers ni administración.
* No se realizaron cambios de Supabase en esta corrección.

PRUEBAS ANTES DE PUBLICAR

1. Verificar la portada pública en PC y móvil.
2. Probar el inicio y cierre de sesión.
3. Confirmar que el cierre de sesión regresa a index.html.
4. Verificar los enlaces profundos, las notificaciones y el acceso a LIVE.
5. Comprobar formación, creadores, managers y administración.
6. Comprobar la instalación y apertura de la aplicación PWA.

ESTADO
Los cambios deben verificarse en el entorno publicado antes de considerar completada la corrección. La creación del pull request no significa que los cambios ya estén publicados ni que las pruebas hayan sido superadas.

NOTA
Las secciones FAQ y testimonios de la portada son estructuras de la maqueta. La configuración guardada en localStorage de la vista previa NO es un panel administrativo conectado al backend; para habilitarlas desde el admin real se requiere integración posterior.

AJUSTE PORTADA ÚNICA — 30-09-2026
- Al cerrar sesión, se redirige a ./index.html (nueva portada pública).
- Si portal.html se abre sin sesión y sin una ruta específica, redirige a ./index.html.
- Las rutas explícitas de autenticación y los enlaces profundos del portal se conservan.
- Se incrementó el parámetro de caché de app.js a v=101 para que el navegador cargue el ajuste.
- No se modificaron app.js en lógica de Supabase, notificaciones, LIVE, formación ni permisos, salvo las rutas de inicio/cierre indicadas.


PORTADA PÚBLICA ÚNICA — AJUSTE DE COMPATIBILIDAD
- index.html es la única portada pública oficial.
- inicio-publico-v12.html ya no muestra una portada duplicada: redirige inmediatamente a index.html para conservar enlaces antiguos sin mostrar la interfaz anterior.
- En portal.html, una sesión cerrada y sin ruta específica debe volver a index.html.
- Tras iniciar sesión, el usuario conserva el destino de su rol: creador a Mi espacio, manager a su panel y admin al panel de administración.
- Cerrar sesión redirige a index.html.
- No se borran módulos internos del portal ni se cambian funciones de Supabase, notificaciones, LIVE o permisos.
