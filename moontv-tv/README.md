# MoonTV Android TV (Kotlin)

Aplicación para Smart TV (Android TV) con secciones:
- TV en vivo (carga lista M3U remota y la parsea)
- Películas
- Series
- Eventos

Incluye reproductor con ExoPlayer/Media3 para reproducir streams HLS/M3U8.

## Estructura
- `MainActivity`: menú principal y listado por sección.
- `CatalogRepository`: catálogo demo + parser M3U.
- `PlayerActivity`: pantalla de reproducción.

## Generar APK en GitHub Actions (recomendado)
1. Sube esta rama a GitHub.
2. Ve a **Actions** y ejecuta el workflow **Build MoonTV Android TV APK**.
3. Descarga el artifact `moontv-tv-debug-apk`.

Salida esperada:
- `moontv-tv/app/build/outputs/apk/debug/app-debug.apk`

## Build local (opcional)
```bash
cd moontv-tv
export JAVA_HOME=/ruta/a/java17
export PATH=$JAVA_HOME/bin:$PATH
gradle :app:assembleDebug
```
