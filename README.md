# FieldTrack API

API REST para FieldTrack (NestJS + TypeORM + PostgreSQL), con la misma estructura operativa que **TerminalOps API**.

## Requisitos

- Node.js 20+
- PostgreSQL 14+ (o Docker)

## Configuración

```bash
cp .env.example .env
npm install
```

Sin `.env`, `migration:run` falla porque `DB_PASSWORD` queda vacío.

### Postgres con Docker (recomendado)

Solo levanta la base; la API corre en el host con hot reload.

```bash
npm run docker:up
npm run migration:run
npm run start:dev
```

En Docker Desktop: proyecto **`fieldtrack-api`**, contenedor **`fieldtrack-postgres`**.  
Puerto host por defecto **5434** (evita choque con TerminalOps en 5433 u otros Postgres en 5432).

### Postgres nativo

```bash
createdb fieldtrack-dev
# Ajusta DB_PORT en .env si tu instancia no usa 5434
```

## Migraciones

Tablas vía TypeORM en `src/migrations/`. La inicial crea el schema `fieldtrack` (sin tablas de dominio aún).

```bash
npm run migration:run
```

En deploy, `dist/src/migrate.js` aplica pendientes con advisory lock (varias réplicas).

## Desarrollo

```bash
npm run start:local   # migration:run + start:dev
npm run start:dev     # solo API watch
```

- API: http://localhost:4001  
- Swagger: http://localhost:4001/api  

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run start:dev` | API en modo watch |
| `npm run start:local` | Migrar + watch |
| `npm run docker:up` / `docker:down` | Postgres local |
| `npm run migration:run` / `migration:revert` | Migraciones |
| `npm run build` | Compila `dist/` |
| `npm run start:prod` | Migrar + `node dist/src/main.js` |
| `npm run db:backup` | Dump gzip del schema `fieldtrack` |

## Añadir un módulo de dominio

1. `nest g module <nombre>` (o carpeta manual como en TerminalOps).
2. Entidades en `src/<nombre>/entities/` con schema `fieldtrack` en `@Entity`.
3. Registrar el módulo en `app.module.ts`.
4. `npm run migration:generate -- src/migrations/<timestamp>-<nombre>` y revisar el SQL.

Rutas tenant-scoped (cuando exista multi-empresa): seguir el patrón TerminalOps  
`/companies/:companyId/...` + JWT con `companyId`.

## Producción (Docker)

```bash
docker compose -f docker-compose.yml --env-file .env up -d --build
```

El contenedor `api` espera Postgres, ejecuta migraciones y arranca Nest.

→ **[docs/ops-prd.md](docs/ops-prd.md)** — secrets, HTTPS, logs, backups, smoke checklist.

## Health

`GET /` (público) → `{ service, status, timestamp }`.
