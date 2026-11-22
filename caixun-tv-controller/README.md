# Caixun TV Controller

Proyecto Android TV independiente. Conserva el prototipo revisado en Java con paquete `com.grayxon.caixuntv`.

## Configuración de compilación

- JDK: 17 (Temurin)
- Gradle: 8.7, provisto en la ejecución de GitHub Actions
- Android Gradle Plugin: 8.6.1
- Android SDK Platform: 34
- Android Build-Tools: 34.0.0

No se incluye emulador ni se instala `platform-tools`: no son necesarios para generar el APK. El proyecto usa Gradle 8.7 desde el flujo de CI, por lo que no hace falta un Gradle Wrapper local.

## Compilación en la nube

Un push a la rama `caixun-tv-controller` que cambie esta carpeta o el flujo de Actions compila la variante debug y publica `app-debug.apk` como artefacto descargable durante 30 días. Abre **Actions > Caixun TV Controller APK**, selecciona la ejecución y descarga `CaixunTVController-debug-apk`.

## Alcance del prototipo

La app ofrece control local de volumen y silencio, lectura del estado interactivo, apertura de aplicaciones instaladas y registros de diagnóstico. Los puntos de extensión para accesibilidad, multimedia y backend están declarados, pero esas funciones remotas no están implementadas.
