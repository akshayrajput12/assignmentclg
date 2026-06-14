---
name: shared-expenses-app
description: >
  Full-stack Next.js app for shared flat expenses. Parses CSV exports, handles
  anomalies, runs debt simplification, and syncs data to Neon PostgreSQL.
  Trigger on any task involving CSV imports, expense calculations, database
  transactions, or layout tabs.
stack:
  frontend: "Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Lucide Icons"
  backend: "Next.js API routes + Prisma 7 ORM + @prisma/adapter-pg"
  database: "Neon Serverless PostgreSQL"
  deploy: "Vercel"
---

# Shared Expenses App — AI Coding Skill

## Project Identity
- **Product:** Spreetail Shared Expenses App — Ledger, anomaly resolution center, and debt simplifier.
- **Core Loop:** Upload CSV spreadsheet → Detect and resolve 21 anomalies in UI → Write normalized records to Neon PostgreSQL → Display simplified settlement paths and individual ledgers.

## Development Rules
1. **Always Await Params:** In Next.js 16/React 19, dynamic API route `params` are promises and must be awaited.
2. **Prisma 7 Adaptability:** Do not write `url` in `schema.prisma`. Migrate settings go to `prisma.config.ts` and driver adapters connect via `PrismaClient({ adapter })`.
3. **Database Transactions:** Group writes (expenses and splits) must run inside a Prisma `$transaction` block to guarantee relational consistency.
4. **Tailwind CSS v4 Standard:** Modify styling only through Tailwind classes or Tailwind theme configurations in `globals.css`.
