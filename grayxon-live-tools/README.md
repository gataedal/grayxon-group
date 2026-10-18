# Grayxon LIVE Tools — piloto aislado

Esta carpeta es una prueba independiente. No modifica el portal oficial ni su base de datos.

## Qué incluye
- Interfaz adaptable a móvil, tableta y computador.
- Demo de comentarios y regalos sin conectar a TikTok.
- Lectura de comentarios con Speech Synthesis del navegador.
- Sonidos de prueba y reglas locales para asignar sonidos por nombre de regalo.
- Servicio Node.js independiente que intenta recibir eventos públicos de TikTok LIVE.

## Ejecutar localmente
Requiere Node.js 20 o superior.

```sh
cd grayxon-live-tools/server
npm install
npm start
``

Abrir `http://localhost:3000`. Para usarlo en otro dispositivo, el servidor debe estar publicado en un host accesible por HTTPS; en ese caso, configurar también el cliente Socket.IO para usar el host del servicio, ya que el piloto local actualmente espera que página y servicio compartan origen.

## Pruebas
1. Abrir la página y pulsar **Probar demo**.
2. Probar voz y sonido por separado.
3. Añadir reglas de regalos y comprobar los dos tonos.
4. Con el servidor en ejecución, introducir el usuario público de una cuenta que esté transmitiendo y pulsar **Conectar LIVE**.

## Limitaciones importantes
- TikTok-Live-Connector es un proyecto comunitario de ingeniería inversa, no una API oficial de TikTok. La conexión puede fallar o romperse cuando TikTok cambie sus sistemas.
- No introducir contraseñas, cookies, session IDs ni secretos de TikTok.
- La demo no requiere servidor ni conexión a TikTok.
- Esta carpeta no integra Supabase, no guarda reglas en una cuenta y no se ha desplegado como servicio público.
- La prueba real requiere instalar dependencias y ejecutar el servidor en un entorno Node.js. GitHub Pages por sí solo no puede ejecutar este backend.
- Los sonidos personalizados subidos por usuarios y la persistencia en Supabase quedan para la siguiente fase, una vez validada la conexión real.
