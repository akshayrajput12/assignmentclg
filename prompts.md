# PROMPTS.md — Development Prompts

This document catalogs the prompts and instructions that guided the AI during pair-programming this project.

---

## 1. System Ingestion Prompts

**Prompt:**
> "Extract the text from the Spreetail assignment PDF. Pay close attention to flatmate details: Aisha wants simplified balances, Rohan wants an itemized breakdown (no magic numbers), Priya wants USD conversion, Sam joined mid-April and shouldn't pay for March, Meera left end of March and wants to approve all duplicate deletions. Identify all technical deliverables required for the final submission."

---

## 2. CSV Parsing & Anomaly Engine Prompt

**Prompt:**
> "Write a robust CSV parser in TypeScript that reads raw spreadsheet lines. Since some fields (like lists of members or percentage splits) contain quotes and commas, implement a character-based state machine to split values on commas while ignoring commas that are enclosed in double quotes. 
> Write a validation function `parseAndAnalyze` that loops through the parsed rows and checks for the following anomalies:
> 1. Date formatting inconsistencies (YYYY-MM-DD vs DD/MM/YYYY vs Month Day). Infer year 2026 for incomplete dates. Identify ambiguous dates (like 04/05/2026) based on chronological context.
> 2. Number anomalies (commas in strings, spaces, negative refund values, fractional paisa).
> 3. Missing paid_by payer and missing currency (default to INR).
> 4. USD currency rows and conversion rates.
> 5. Timeline violations: check if any member (like Meera) is charged after their left date, or if someone is charged before their join date.
> 6. Math errors: validate percentage splits sum to 100% and unequal splits sum to the total expense amount. Re-scale them if wrong.
> 7. Duplicate logging: flag row items with identical dates, payers, amounts, and similar descriptions.
> 8. Double-logging conflicts: flag same-date expenses at the same venue with differing payers or amounts.
> 9. Non-member guest accounts (like Kabir)."

---

## 3. Database & Transaction API Prompt

**Prompt:**
> "Create a Prisma 7 PostgreSQL schema matching our transaction model. Since Vercel serverless functions are stateless, write a database transaction POST route `/api/import/confirm` that:
> 1. Cleans up existing records for a fresh import state.
> 2. Sets up users and memberships with proper timelines (Meera active Feb-Mar, Sam active from mid-April).
> 3. Inserts all expenses and payments.
> 4. Runs everything inside a single Prisma `$transaction` so that if any insert fails, the database rolls back to its initial state."

---

## 4. UI Dashboard & Resolution Center Prompt

**Prompt:**
> "Build a premium dark-themed Tailwind CSS dashboard in Next.js. Provide four tabs: Dashboard, Rohan's Ledger, CSV Import, and Timeline.
> In the CSV Import tab, show a drag-and-drop box and an option to import the local file from the server. Once analyzed, build an Anomaly Resolution Center:
> - Display critical issues (like missing payer) with dropdown selectors to resolve them.
> - Display Meera's duplicates and double-logged conflicts side-by-side with toggle buttons, letting the user select which rows to delete/skip or merge.
> - Provide a setting to adjust the USD exchange rate.
> - Display a preview table showing which rows are ready, skipped, or unassigned.
> Once finalized, clicking 'Write to DB' should trigger the transaction sync."
