GRAYXON GROUP — INTEGRACIÓN DE PRUEBA DE PORTADA v12
=====================================================

OBJETIVO
- index.html: nueva portada pública aprobada.
- portal.html: copia de la aplicación existente para iniciar sesión y usar el portal.
- inicio-publico-v12.html: se conserva como referencia independiente de la portada aprobada.
- manifest.webmanifest: start_url dirigido a portal.html para que la app instalada siga abriendo el portal.

COMPATIBILIDAD
- La portada redirige los hashes/rutas del portal (incluidos enlaces profundos de notificaciones) a portal.html.
- El botón “Iniciar sesión” abre portal.html#auth.
- app.js, sw.js y config.js se conservan sin cambios respecto al ZIP fuente.
- No se ejecutaron cambios de Supabase ni despliegues.

PRUEBA ANTES DE PUBLICAR
1. Subir el contenido de esta carpeta a una rama de prueba, sin combinar con main.
2. Verificar portada en PC y móvil.
3. Probar inicio de sesión, rutas con hash, notificaciones, LIVE, formación, creadores, managers y administración.
4. Probar la instalación PWA y los metadatos de vista previa al compartir.
5. No publicar hasta completar las pruebas.

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
