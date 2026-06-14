# ACTION.md — Action Log

This document tracks all developer actions, feature implementations, and git commits executed during the development of this project.

---

## Chronological Milestones

1. **Research & PDF Analysis:**
   - Evaluated `Updated Assignment_Spreetail.pdf` using OCR.
   - Identified flatmate requirements (Aisha, Rohan, Priya, Sam, Meera, Dev) and minimum product details.
   - Resolved the tinyurl link `https://tinyurl.com/4xbxz6mx` to download the PDF itself, and successfully resolved the Sharepoint link in the PDF to find the `expenses_export.csv` file.
2. **Implementation Plan:**
   - Created `implementation_plan.md` to map out the Next.js and relational database structure.
3. **CSV Examination:**
   - Read `expenses_export.csv` to map 21 distinct data anomalies (duplicates, casing, missing currency, math mistakes, timeline issues, missing payer).
4. **Project Scaffolding:**
   - Initialized a Next.js 16 typescript project inside a temporary folder to avoid empty directory conflicts.
   - Moved project files to the root workspace.
   - Configured `.gitignore` to exclude the PDF and local `.env` keys.
   - Made **Commit 1:** `chore: initialize Next.js TypeScript project with Tailwind CSS`
5. **Database Models & ORM:**
   - Installed `prisma`, `@prisma/client`, and database drivers.
   - Initialized Prisma config.
   - Designed a Prisma schema for PostgreSQL with `User`, `Group`, `GroupMember` (timeline tracking), `Expense`, `ExpenseSplit`, and `Payment` (settlements).
   - Made **Commit 2:** `feat: set up Prisma PostgreSQL schema and client singleton`
6. **CSV Parser & Anomaly Engine:**
   - Wrote `src/lib/parser.ts` containing a state-machine parser and anomaly engine checks.
   - Made **Commit 3:** `feat: implement CSV parsing and data anomaly detection service`
7. **APIs & DB Sync:**
   - Wrote backend REST API endpoints:
     - `/api/import` (dry-run parser)
     - `/api/import/confirm` (atomic transaction writes)
     - `/api/balances` (overall metrics and Simplified payments)
     - `/api/balances/ledger/[name]` (Rohan's audit trail)
     - `/api/import/local-file` (convenience file-reader)
   - Made **Commit 4:** `feat: implement CSV import, database write, balance calculations, and audit ledger API routes`
   - Made **Commit 5:** `feat: add API route to read local expenses_export.csv file`
8. **Frontend Interface:**
   - Built a high-fidelity Tailwind dashboard in `src/app/page.tsx` incorporating tab navigation, drag-and-drop file imports, side-by-side duplicate diffs, dropdown payer mapping, and transaction history tables.
   - Fixed type parameters in dynamic params to align with Next.js 16's asynchronous requirements.
   - Tested and verified project compilation using `npm run build` (successful Turbopack static optimization).
   - Made **Commit 6:** `feat: implement main dashboard React UI with anomaly resolutions and audit ledgers`
   - Made **Commit 7:** `chore: configure pg adapter for database and Prisma 7 compatibility`
   - Made **Commit 8:** `feat: add balance calculation service, base styling and app shell layout`
   - Made **Commit 9:** `data: add the messy raw expenses_export.csv spreadsheet file`
9. **Documentation Files:**
   - Created all 12 requested markdown files describing code, architecture, designs, prompts, and AI errors.
