# Ops PRD — FieldTrack API

Checklist para producción (misma línea que TerminalOps).

## 1. Secrets y entorno

No commitees `.env`. En el host / Railway:

| Variable | Producción |
|----------|------------|
| `NODE_ENV` | `production` |
| `ORIGIN` | URL HTTPS del FE (varias: coma) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ≥32 chars, distintos, no los del example |
| `DB_*` | Postgres gestionado |
| `DB_SSL` | `true` en cloud |
| `ALERT_WEBHOOK_URL` | (opcional) webhook 5xx |
| `ENABLE_SWAGGER` | omitir o `false` |
| `RW_*` / AWS bucket | **Producción:** credenciales del Railway Bucket (documentos socios/solicitudes) |

El boot falla en `production` si faltan secrets o `ORIGIN` es `*` / localhost.  
Sin bucket configurado, **subir** documentos responde 503; **descargar** sigue funcionando para filas legacy en Postgres (`bytea`).

## 2. HTTPS y proxy

- `trust proxy` activo.
- `helmet` en la API; TLS en el reverse proxy.
- FE solo llama `https://…`.

## 3. Logs y alertas

Request JSON con `requestId`, `status`, `durationMs`. Los 5xx pueden notificar vía `ALERT_WEBHOOK_URL` (throttle 15s).

## 4. Backup Postgres

```bash
npm run db:backup
npm run db:backup:verify
```

Backups en `./backups/fieldtrack-*.sql.gz` (schema `fieldtrack` + `migrations_list`).

## 5. Railway

Mismo esquema que TerminalOps: variables en el panel (no `.env` en repo), `npm start` en API y FE, Postgres plugin → `DB_*`.

→ **[deploy-railway.md](./deploy-railway.md)**

## 6. Smoke deploy

1. Variables PRD correctas  
2. `DB_SSL=true` si aplica  
3. `GET /` → 200  
4. Migraciones aplicadas (log de `migrate.js` al arrancar)  
5. CORS desde el dominio FE  
