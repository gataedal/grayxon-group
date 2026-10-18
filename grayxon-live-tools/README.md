# Grayxon LIVE Tools — piloto aislado

Esta carpeta es una prueba independiente. No modifica el portal oficial ni su base de datos.

## Qué incluye
- Interfaz adaptable a móvil, tableta y computador.
- Demo de comentarios y regalos sin conectar a TikTok.
- Lectura de comentarios con Speech Synthesis del navegador.
- Sonidos de prueba y reglas locales para asignar sonidos por nombre de regalo.
- Servicio Node.js independiente que intenta recibir eventos públicos de TikTok LIVE.
- Docker Compose aislado que liga el servicio solo a localhost, sin tocar puertos ni proxy de Jitsi.
- Túnel HTTPS temporal gratuito opcional para probar desde otro dispositivo sin comprar dominio ni cambiar DNS.

## Despliegue aislado en el VPS existente
Requiere Docker y Docker Compose. En el servidor, ejecutar:

```sh
cd /opt
git clone --single-branch --branch pilot/grayxon-live-tools https://github.com/gataedal/grayxon-group.git grayxon-pilot
cd /opt/grayxon-pilot/grayxon-live-tools
bash deploy-vps.sh
```

Esto crea únicamente el contenedor `grayxon-live-tools-pilot` y publica su puerto internamente en `127.0.0.1:3017`. No modifica Jitsi, Nginx, firewall, DNS, portal ni Supabase.

## Probar desde otro dispositivo sin pagar
Después de que el despliegue local pase la comprobación de salud, abre una segunda sesión SSH al VPS y ejecuta:

```sh
cd /opt/grayxon-pilot/grayxon-live-tools
bash start-demo-tunnel.sh
```

El comando mostrará una URL HTTPS temporal `https://....trycloudflare.com`. Abre esa URL en el segundo dispositivo. Mantén el comando activo durante la prueba; el enlace deja de funcionar al detenerlo. El túnel lo presta Cloudflare, no requiere modificar DNS ni añadir un pago.

## Pruebas
1. Abre la página y pulsa **Probar demo**.
2. Prueba voz y sonido por separado.
3. Añade reglas de regalos y comprueba los tonos.
4. Con el servidor activo, introduce el usuario público de una cuenta que esté transmitiendo y pulsa **Conectar LIVE**.

## Limitaciones importantes
- TikTok-Live-Connector es un proyecto comunitario de ingeniería inversa, no una API oficial de TikTok. Puede fallar o romperse si TikTok cambia sus sistemas.
- No introducir contraseñas, cookies, session IDs ni secretos de TikTok.
- La demo no requiere conexión a TikTok.
- El servicio real requiere Node.js y acceso a Internet desde el VPS.
- Los sonidos personalizados y la persistencia en Supabase quedan para una fase posterior, una vez validada la conexión real.
- El túnel gratuito es temporal y no es adecuado como despliegue permanente.
