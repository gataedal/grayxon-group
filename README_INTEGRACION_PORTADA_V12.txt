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
Las secciones FAQ y testimonios de la portada son estructuras de la maqueta. No deben considerarse funciones conectadas al panel administrativo sin una integración adicional con el backend.
