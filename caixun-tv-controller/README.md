# Caixun TV Controller
Prototipo independiente Android TV, paquete `com.grayxon.caixuntv`, versión 0.2.0.

## Incluido en 0.2.0
- Volumen y silencio explícito con AudioManager; estado y política de volumen fijo.
- Estado interactivo de PowerManager y diagnóstico de conectividad a Internet.
- Detección y apertura de Spotify, YouTube y Disney+ si están instaladas y exponen una actividad de lanzamiento.
- Inicio, Atrás y D-pad globales a través del servicio opcional de Accesibilidad. El usuario debe activarlo manualmente en el TV. El servicio no inspecciona contenido de pantalla.
- Interfaz enfocada a TV, usable con el D-pad del control físico, foco visible y diagnóstico en pantalla/Logcat.
- Alexa/backend aún no está conectado. La arquitectura propuesta está en [docs/remote-architecture.md](docs/remote-architecture.md).

## Build
GitHub Actions compila con Temurin 17, Gradle 8.7, AGP 8.6.1, SDK 34 y Build-Tools 34.0.0; no instala emulador. Publica un APK debug como artefacto de 30 días.
