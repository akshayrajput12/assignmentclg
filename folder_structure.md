# FOLDER_STRUCTURE.md — Directory Layout

This document details the clean, component-based file structure of the Shared Expenses App.

```
assignment/
├── prisma/
│   ├── schema.prisma           # Prisma database schema definition (PostgreSQL)
│   └── migrations/             # Database migration history (if generated)
├── public/                     # Static assets (favicons, icons)
├── src/
│   ├── app/                    # Next.js App Router root
│   │   ├── api/                # Backend API Routes
│   │   │   ├── balances/       # APIs for balance queries
│   │   │   │   ├── route.ts    # GET: overall balances & simplified payments
│   │   │   │   └── ledger/
│   │   │   │       └── [name]/
│   │   │   │           └── route.ts  # GET: Rohan's individual itemized ledger
│   │   │   └── import/         # APIs for CSV imports
│   │   │       ├── route.ts    # POST: dry-run CSV parsing & anomaly detection
│   │   │       ├── confirm/
│   │   │       │   └── route.ts # POST: atomic database write for approved data
│   │   │       └── local-file/
│   │   │           └── route.ts # GET: convenience local CSV filesystem reader
│   │   ├── globals.css         # Tailwind v4 directives and theme variables
│   │   ├── layout.tsx          # HTML root template and Geist fonts config
│   │   └── page.tsx            # Main dashboard frontend interface (State & Tabs)
│   ├── lib/                    # Reusable services and utilities
│   │   ├── db.ts               # Prisma client singleton (handles pg connection pool)
│   │   ├── parser.ts           # State-machine CSV parser and anomaly analyzer
│   │   └── balances.ts         # Net balance calculations & simplify debts logic
├── .env                        # Local database environment variables (git-ignored)
├── .gitignore                  # Git exclusions list (ignores env and PDF)
├── AGENTS.md                   # AI developer guidelines
├── CLAUDE.md                   # Developer configuration shortcuts
├── eslint.config.mjs           # ESLint configuration
├── expenses_export.csv         # Raw CSV spreadsheet (to be imported)
├── next-env.d.ts               # Next.js typescript declarations
├── next.config.ts              # Next.js configuration
├── package-lock.json           # Locked npm packages dependency tree
├── package.json                # Project dependencies, scripts, and details
├── postcss.config.mjs          # PostCSS configurations for Tailwind v4
├── prisma.config.ts            # Prisma 7 database configuration file
└── tsconfig.json               # TypeScript configuration parameters
```
