# MoonTV Android TV (Kotlin)

App para Smart TV conectada al backend:
- `http://146.235.246.187:3000`

Secciones:
- TV en vivo (`/api/channels`)
- Películas (`/api/movies`)
- Series (`/api/series`)
- Eventos (`/api/events`, puede requerir `ADMIN_KEY` en backend)

## Reproducción
- Canales: reproduce `streamUrl` con Media3/ExoPlayer.
- Películas y Series: primero resuelve `/play`; si la URL es tipo `cineby/embed`, abre en `WebView`; si es stream directo (`.m3u8/.mp4`), usa ExoPlayer.

## Generar APK en GitHub Actions
1. Subir rama a GitHub.
2. Ejecutar workflow **Build MoonTV Android TV APK**.
3. Descargar artifact `moontv-tv-debug-apk`.

## Build local
```bash
cd moontv-tv
export JAVA_HOME=/ruta/a/java17
export PATH=$JAVA_HOME/bin:$PATH
gradle :app:assembleDebug
```
