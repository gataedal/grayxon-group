# Prueba local de LiveKit (Grayxon)

Esta herramienta es independiente de la aplicación publicada y vive únicamente en la rama `feature/livekit-training-integration`.

## Cómo ejecutarla en Windows

1. En GitHub, abre la rama `feature/livekit-training-integration` y descarga el ZIP de esa rama desde **Code → Download ZIP**.
2. Extrae todo el ZIP a una carpeta. No muevas `livekit-local-test.html` fuera de esa carpeta: necesita `config.js` al lado.
3. Instala Python 3 si el equipo no tiene el comando `py`.
4. Abre la carpeta extraída y ejecuta `start-livekit-test.bat`.
5. Se abrirá `http://127.0.0.1:8765/livekit-local-test.html`. Inicia sesión en esa página local con tu cuenta Grayxon.
6. Pega el UUID de un entrenamiento que esté activo y al que tu cuenta tenga acceso. Pulsa **Conectar** y prueba micrófono, cámara y compartir pantalla.

## Seguridad y límites

- No publiques esta página ni introduzcas la contraseña en una página alojada por terceros.
- La contraseña se envía desde tu navegador local directamente a Supabase Auth. No la compartas en el chat.
- La función de tokens de LiveKit valida el usuario y sus permisos; un entrenamiento cerrado o sin permisos debe rechazarse.
- El archivo `config.js` contiene únicamente la URL de Supabase y una clave publicable de cliente; nunca añadas secretos privados.
- Esta es una prueba técnica aislada, no una migración terminada. No sustituye Jitsi ni activa LiveKit en producción.
