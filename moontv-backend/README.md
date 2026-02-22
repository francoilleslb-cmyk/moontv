# 🌙 Moon TV Backend v3 — Guía completa

---

## PASO 1: BORRAR TODO LO VIEJO

### 1A. Borrar el servicio en Render

1. Entrá a **https://dashboard.render.com**
2. En el menú izquierdo hacé click en **"Web Services"**
3. Encontrá tu servicio `moon-tv-dmws` (o como lo hayas llamado)
4. Hacé click en el servicio → luego en **"Settings"** (pestaña derecha)
5. Bajá hasta abajo del todo → **"Delete Web Service"**
6. Confirmá escribiendo el nombre del servicio → **Delete**

✅ El servicio de Render quedó borrado.

---

### 1B. Borrar la base de datos en MongoDB Atlas

1. Entrá a **https://cloud.mongodb.com**
2. Hacé click en tu proyecto → **"Clusters"**
3. Hacé click en **"Browse Collections"** de tu cluster
4. Vas a ver la base de datos `moontv` (o como se llame)
5. Hacé click en los **tres puntitos** al lado del nombre de la DB
6. Seleccioná **"Drop Database"**
7. Escribí el nombre de la DB para confirmar → **Drop**

> ⚠️ Esto borra TODOS los datos (usuarios, canales, películas, etc.).
> Si querés conservar algo, exportalo primero desde "Collections" → Export.

✅ La base de datos quedó vacía (el cluster sigue activo, solo se borró la DB).

---

### 1C. Borrar el repo en GitHub

1. Entrá a **https://github.com** y abrí el repositorio del backend
2. Hacé click en **"Settings"** (la última pestaña del repo)
3. Bajá hasta abajo del todo → sección **"Danger Zone"**
4. Hacé click en **"Delete this repository"**
5. Confirmá escribiendo `usuario/nombre-del-repo`
6. Click en **"I understand, delete this repository"**

✅ El repo viejo quedó borrado.

---

## PASO 2: CREAR EL NUEVO REPO EN GITHUB

1. Andá a **https://github.com/new**
2. Nombre: `moontv-backend`
3. Visibilidad: **Private** (recomendado)
4. **NO** marques "Add README" ni "Add .gitignore" (lo vamos a subir nosotros)
5. Click en **"Create repository"**
6. Copiá la URL del repo (algo como `https://github.com/tuusuario/moontv-backend.git`)

---

## PASO 3: SUBIR EL CÓDIGO NUEVO

Abrí una terminal en la carpeta de este proyecto y ejecutá:

```bash
# 1. Inicializar git
git init

# 2. Crear .gitignore
echo "node_modules/\n.env" > .gitignore

# 3. Agregar todos los archivos
git add .

# 4. Primer commit
git commit -m "feat: Moon TV Backend v3 con panel de admin"

# 5. Conectar con GitHub (reemplazá con tu URL)
git remote add origin https://github.com/TUUSUARIO/moontv-backend.git

# 6. Subir
git branch -M main
git push -u origin main
```

✅ El código nuevo está en GitHub.

---

## PASO 4: CREAR EL NUEVO SERVICIO EN RENDER

1. Andá a **https://dashboard.render.com** → **"New +"** → **"Web Service"**
2. Conectá con GitHub → seleccioná el repo `moontv-backend`
3. Completá el formulario:

| Campo | Valor |
|-------|-------|
| **Name** | `moontv-backend` (o el que quieras) |
| **Region** | Oregon (US West) — más rápido para América |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |

4. Hacé click en **"Advanced"** → **"Add Environment Variable"** y agregá estas 4:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | Tu URI de MongoDB Atlas (de "Connect" → "Drivers") |
| `JWT_SECRET` | Una frase larga: ej `luna-secreta-moon-tv-2024-xyz` |
| `ADMIN_KEY` | Tu contraseña del panel: ej `admin-panel-clave-2024` |
| `PORT` | `3000` |

5. Click en **"Create Web Service"**
6. Esperá ~2 minutos a que depliegue
7. Tu URL nueva será algo como: `https://moontv-backend.onrender.com`

✅ El nuevo backend está deployado.

---

## PASO 5: ABRIR EL PANEL DE ADMIN

Una vez que Render termine de deployar:

```
https://moontv-backend.onrender.com/admin
```

- Ingresá tu **ADMIN_KEY** en el campo de la parte superior
- Ya podés agregar canales, películas, series y eventos

---

## PASO 6: ACTUALIZAR LA APP ANDROID

En `RetrofitClient.java` (o en las preferencias de la app), cambiá la URL base:

```java
// Antes:
"https://moon-tv-dmws.onrender.com/"

// Ahora:
"https://moontv-backend.onrender.com/"
```

O si la URL se guarda en las preferencias del dispositivo, simplemente
cambiala desde la pantalla de Configuración de la app.

---

## RESUMEN DE ENDPOINTS

### 🔐 Auth
```
POST /api/auth/register     → registrar usuario
POST /api/auth/login        → login (devuelve token JWT)
GET  /api/auth/me           → perfil (requiere JWT)
PUT  /api/auth/update-profile
```

### 📺 Canales (público)
```
GET /api/channels               → lista canales activos
GET /api/channels?category=X    → filtrar por categoría
GET /api/channels?q=cnn         → buscar
GET /api/channels/categories    → categorías únicas
GET /api/channels/stats         → stats para el panel
GET /api/channels/:id           → canal por ID o slug
POST /api/channels/:id/favorite → toggle favorito (JWT)
POST /api/channels/:id/view     → registrar vista
```

### 📺 Canales (admin — requiere header x-admin-key)
```
POST   /api/channels            → crear
PUT    /api/channels/:id        → editar
PATCH  /api/channels/:id/status → activar/desactivar
DELETE /api/channels/:id        → eliminar
POST   /api/channels/import     → importar JSON o M3U
```

### 🎬 Películas y 📺 Series
```
GET /api/movies          → lista
GET /api/movies/search?q → búsqueda
GET /api/movies/:id      → detalle
POST/PUT/DELETE admin igual que canales
```

### ⚽ Eventos deportivos
```
GET /api/events/today    → eventos de hoy
GET /api/events?days=7   → próximos eventos
POST/PUT/DELETE admin
```

### 🎛️ Panel web
```
GET /admin   → Panel de administración (navegador)
```
