# EduLM

Multi-tenant school management SaaS. Eduka-like feature set, built on Next.js + Postgres + Prisma.

## Quickstart

```bash
# 1. Install deps
npm install

# 2. Copy env and fill in values
cp .env.example .env
# (Generate AUTH_SECRET with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 3. Start Postgres (Docker shortcut)
docker run --name edulm-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16

# 4. Generate Prisma client and push schema
npm run db:generate
npm run db:push

# 5. Run dev server
npm run dev
```

Open <http://localhost:3000>.

## Multi-tenant routing

- **Production:** subdomain — `montaigne.edulm.app` serves the Lycée Montaigne tenant.
- **Dev:** path-based — `http://localhost:3000/t/montaigne/...` resolves the same tenant.

Middleware sets the `x-tenant-slug` header; `getCurrentTenant()` reads it and binds the request to `runWithTenant(...)` so every Prisma query is auto-scoped.

## Project layout

```
src/
  app/             Next.js App Router routes
  i18n/            next-intl config + fr/en/ar message files
  lib/
    auth.ts          Auth.js v5 config (credentials + Resend magic link)
    db.ts            Prisma client with tenant-scoping extension
    tenant-context.ts AsyncLocalStorage tenant binding
    tenant-resolve.ts Edge-safe slug extraction
    with-tenant.ts    Server-side tenant resolution + scope wrapper
  middleware.ts    Edge middleware: subdomain/path → x-tenant-slug header
prisma/
  schema.prisma    Multi-tenant Prisma schema
```

## Roles

- `SUPER_ADMIN` — SaaS operator, spans all tenants
- `SCHOOL_ADMIN` — runs one school
- `TEACHER` — class-bound, enters attendance/discipline
- `PARENT` — linked to one or more students via Guardian
