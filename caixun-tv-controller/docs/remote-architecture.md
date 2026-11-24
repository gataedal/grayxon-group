# Alexa y control remoto: diseño sin PC encendido
Estado: arquitectura estudiada; no hay backend desplegado, skill publicada, credenciales ni servicios contratados.

## Flujo propuesto
1. Una Alexa Smart Home skill envía directivas firmadas a un endpoint HTTPS en la nube (por ejemplo AWS Lambda).
2. El backend valida firma, cuenta vinculada, dispositivo y tipo de acción; traduce únicamente a un conjunto permitido (volumen, mute, Home/Back/D-pad, abrir apps). Nada de shell/ADB.
3. La app de TV abre por sí misma una conexión saliente TLS al broker/gateway cloud (MQTT sobre TLS es una opción; WebSocket seguro también). La TV no expone puertos entrantes.
4. El backend publica una orden dirigida solo al tópico/identidad de esa TV. La app verifica expiración/ID, ejecuta con AudioManager o AccessibilityService, y devuelve ACK y estado.
5. Vinculación de una sola vez con código temporal que se muestra en TV. Identidad de dispositivo con clave protegida por Android Keystore, credenciales rotables/revocables y ACL por TV.

El servicio cloud debe permanecer disponible y puede generar costos; AWS Lambda, API Gateway e IoT Core son ejemplos a evaluar, no compras ni una decisión. Antes del despliegue se requiere confirmar la cuenta/región, estimar costo y autorizar proveedores. El secreto Alexa nunca se incorpora al APK.

## Seguridad y comportamiento
- Validar TLS; autenticación por dispositivo y autorización por cuenta en servidor; ACL estrechas, expiración corta, nonce/idempotencia, límites de frecuencia y registro mínimo.
- Órdenes de estado explícito (mute=true/false, volume=n), no toggles. Enviar ACK de resultado y devolver estado desconocido si la TV no confirma.
- La app de TV inicia la conexión; no se reciben conexiones entrantes. ADB queda para desarrollo/diagnóstico LAN y jamás se publica en Internet.
- Sin red/proceso de app no hay entrega. No guardar órdenes de toggle para ejecutarlas luego.

## Límites Android TV
- El prototipo usa AccessibilityService para acciones globales. Android exige habilitación manual; Android 13/API 33 añadió D-pad global en AccessibilityService y Android TV 14 lo soporta por API, pero falta probar el firmware Caixun. El servicio declara que no recupera el contenido de pantalla.
- El proceso y socket no son permanentes garantizados. El sistema/OEM puede matar la app, suspender Wi-Fi o cortar sockets en reposo. Boot receiver o foreground service no garantizan ejecución perpetua; Android 14 restringe algunos foreground services al arranque.
- PowerManager.isInteractive solo refleja interacción del sistema, no alimentación física del panel.
- No afirmamos encendido a TV apagada. La app de usuario no ofrece API pública genérica de power-on. Wake-on-LAN, HDMI-CEC o modo standby de red dependen de modelo/firmware/hardware y requieren pruebas. Alexa solo podrá controlar cuando la TV despierte y la app reconecte.
- AudioManager puede no surtir efecto si isVolumeFixed=true. Las apps deben estar instaladas, visibles y con actividad lanzable.
- Reproducción multimedia global no incluida en esta versión: debe probarse contra las sesiones MediaSession reales de YouTube/Spotify/Disney+; no se marca como éxito basándose en que Android acepte una llamada.

## Siguiente validación
1. Instalar manualmente el APK debug y probar cada botón en el televisor y en las apps.
2. Probar suspensión, Wi-Fi en standby, cierre forzado y reinicio. Documentar exactamente qué se recupera.
3. Elegir proveedor y presupuesto del backend solo tras aprobación.
4. Implementar vinculación, cliente TLS saliente/reconexión, protocolo de órdenes y ACK en entorno de prueba.
5. Integrar Alexa y probar estados/reportes; solo después estudiar encendido con el modelo exacto.
