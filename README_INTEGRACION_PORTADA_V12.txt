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
