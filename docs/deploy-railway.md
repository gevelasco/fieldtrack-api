# Deploy en Railway (igual que TerminalOps)

Dos servicios en el mismo proyecto Railway: **Postgres** + **fieldtrack-api** + **fieldtrack-app** (repos separados en GitHub).

## 1. Postgres

1. Añade el plugin **PostgreSQL** al proyecto (servicio aparte, p. ej. `Postgres`).
2. En **fieldtrack-api** → **Variables** → **Add Variable** → **Add Reference** → selecciona el servicio Postgres.

**Opción A (más simple):** una sola referencia:

| Variable en API | Referencia |
|---------------|------------|
| `DATABASE_PRIVATE_URL` | `${{Postgres.DATABASE_PRIVATE_URL}}` |

(o `DATABASE_URL` → `${{Postgres.DATABASE_URL}}` si usas URL pública).  
La API parsea la URL y rellena `DB_*` al arrancar.

**Opción B:** cinco variables `DB_*`:

| Variable API | Referencia |
|--------------|------------|
| `DB_HOST` | `${{Postgres.PGHOST}}` |
| `DB_PORT` | `${{Postgres.PGPORT}}` |
| `DB_USERNAME` | `${{Postgres.PGUSER}}` |
| `DB_PASSWORD` | `${{Postgres.PGPASSWORD}}` |
| `DB_DATABASE` | `${{Postgres.PGDATABASE}}` |
| `DB_SSL` | `true` |

**Importante:** el nombre del servicio en `${{…}}` debe coincidir con el de tu Postgres en Railway (no es siempre `Postgres`).  
Si el deploy dice `Probe: DB_PASSWORD=missing, DATABASE_URL=missing…`, **no hay referencias** en el servicio API — repite el paso 2.

No commitees `.env`; en Railway no hay `.env` en runtime.

## 2. fieldtrack-api

- **Root directory:** `/` (repo `fieldtrack-api`)
- **Start command:** `npm start` (default → `migration:run:server` + `main.js`)
- **Build command:** `npm run build` (Nixpacks suele detectarlo)

Variables obligatorias en producción:

| Variable | Valor |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | lo inyecta Railway (no hardcodear en Dockerfile local) |
| `ORIGIN` | URL **exacta** del FE en el navegador (sin `/` final), p. ej. `https://fieldtrack-app-production.up.railway.app` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ≥32 chars, distintos, **no** los de `.env.example` |
| `DB_*` | ver tabla Postgres |
| `DB_SSL` | `true` |

Opcionales: `ALERT_WEBHOOK_URL`, `ENABLE_SWAGGER=false`.

**Documentos (obligatorio en PRD):** enlaza el **Railway Bucket** al servicio API con las mismas variables que TerminalOps (`RW_*` o preset AWS SDK): `RW_URL`, `RW_REGION`, `RW_S3_BUCKET`, `RW_ACCESS_KEY_ID`, `RW_SECRET_ACCESS_KEY`. Sin bucket, las cargas responden 503 (*Object storage is not configured*).

Smoke: `GET https://<api>/` → 200 y log `Migrations: …` en el primer deploy.

## 3. fieldtrack-app

- **Root directory:** `/` (repo `fieldtrack-app`)
- **Start command:** `npm start` → `ng build` + `serve` en `0.0.0.0:$PORT`

Antes del primer deploy, edita `src/environments/environment.ts` y pon la URL pública de la API (mismo patrón que TerminalOps):

```ts
apiUrl: 'https://fieldtrack-api-production.up.railway.app',
```

Build de producción usa `environment.ts` (sin `fileReplacements`); dev usa `environment.development.ts` vía `ng serve`.

## 4. Orden recomendado

1. Deploy API + Postgres → health OK.
2. Actualizar `environment.ts` con la URL real de la API → deploy FE.
3. Ajustar `ORIGIN` en la API al dominio final del FE → redeploy API.
4. Login / CORS smoke desde el navegador.

## 5. CORS / “no llega nada” en Network logs

En el navegador, **“CORS error”** a veces es en realidad **la API inalcanzable** (URL mal, dominio no generado, SSL). Si en Railway **no ves requests** en el servicio **fieldtrack-api**:

1. **Dominio público API:** servicio API → **Settings → Networking → Generate Domain**. Prueba en el navegador `https://<tu-api>.up.railway.app/` → JSON health.
2. **`environment.ts`:** `apiUrl` debe ser **esa** URL (https, sin `/` final). Redeploy la **app** tras cambiarla.
3. **`ORIGIN` en la API:** debe ser la URL donde abres el FE (DevTools → pestaña Network → cualquier request → header **`Origin`**). Sin `www` si el FE no lo usa; sin `/` al final.
4. **Logs correctos:** Network/metrics del servicio **API**, no del frontend estático.
5. **Preflight:** login envía `Authorization`; la API permite `OPTIONS` + esos headers (ver `main.ts`).

Comprueba CORS desde terminal (sustituye URLs):

```bash
curl -sI -X OPTIONS 'https://TU-API.up.railway.app/auth/login' \
  -H 'Origin: https://TU-APP.up.railway.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization'
```

Debes ver `access-control-allow-origin` con la URL del FE.

Ver también [ops-prd.md](./ops-prd.md).
