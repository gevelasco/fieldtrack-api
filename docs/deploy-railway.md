# Deploy en Railway (igual que TerminalOps)

Dos servicios en el mismo proyecto Railway: **Postgres** + **fieldtrack-api** + **fieldtrack-app** (repos separados en GitHub).

## 1. Postgres

1. Añade el plugin **PostgreSQL** al proyecto.
2. En el servicio **fieldtrack-api**, conecta Postgres al servicio API (Railway inyecta `PG*` o `DATABASE_URL`).

**Opción A (recomendada):** variables de referencia con prefijo `DB_`:

| Variable API | Referencia Railway |
|--------------|-------------------|
| `DB_HOST` | `${{Postgres.PGHOST}}` |
| `DB_PORT` | `${{Postgres.PGPORT}}` |
| `DB_USERNAME` | `${{Postgres.PGUSER}}` |
| `DB_PASSWORD` | `${{Postgres.PGPASSWORD}}` |
| `DB_DATABASE` | `${{Postgres.PGDATABASE}}` |
| `DB_SSL` | `true` |

**Opción B:** solo el plugin Postgres referenciado al servicio API (sin `DB_*`). Al arrancar, la API **mapea** `PGPASSWORD` / `DATABASE_URL` → `DB_*` (`config/resolve-db-env.ts`).

No commitees `.env`; en Railway no hay archivo `.env` en runtime.

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
