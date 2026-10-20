# Deploy en Railway (igual que TerminalOps)

Dos servicios en el mismo proyecto Railway: **Postgres** + **fieldtrack-api** + **fieldtrack-app** (repos separados en GitHub).

## 1. Postgres

1. Añade el plugin **PostgreSQL** al proyecto.
2. En el servicio **fieldtrack-api**, referencia las variables del plugin o copia manualmente a los nombres que usa la API:

| Variable API | Origen típico (Railway Postgres) |
|--------------|----------------------------------|
| `DB_HOST` | `${{Postgres.PGHOST}}` o host interno |
| `DB_PORT` | `${{Postgres.PGPORT}}` |
| `DB_USERNAME` | `${{Postgres.PGUSER}}` |
| `DB_PASSWORD` | `${{Postgres.PGPASSWORD}}` |
| `DB_DATABASE` | `${{Postgres.PGDATABASE}}` |
| `DB_SSL` | `true` (Postgres gestionado / URL pública) |

No commitees `.env`; todo va en **Variables** del servicio.

## 2. fieldtrack-api

- **Root directory:** `/` (repo `fieldtrack-api`)
- **Start command:** `npm start` (default → `migration:run:server` + `main.js`)
- **Build command:** `npm run build` (Nixpacks suele detectarlo)

Variables obligatorias en producción:

| Variable | Valor |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | lo inyecta Railway (no hardcodear en Dockerfile local) |
| `ORIGIN` | URL HTTPS del FE, p.ej. `https://fieldtrack-app-production.up.railway.app` |
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

Ver también [ops-prd.md](./ops-prd.md).
