# Spreetail Shared Expenses App

An AI-collaborative, premium, full-stack Next.js application built to resolve shared flat expenses for Aisha, Rohan, Priya, Meera, Sam, and Dev. It includes a custom CSV parsing and anomaly resolution engine, relational database synchronization with Neon PostgreSQL, and minimal-transaction debt simplification.

## Technical Stack
- **Framework:** Next.js 16 (App Router + Turbopack)
- **Database:** Neon PostgreSQL (Relational)
- **ORM:** Prisma 7 (with `@prisma/adapter-pg` connection pooling)
- **Styling:** Tailwind CSS v4 (Modern dark-mode theme, glassmorphism, responsive grid)
- **Language:** TypeScript 5

---

## Setup & Installation

### 1. Clone & Install Dependencies
First, install all necessary packages:
```bash
npm install
```

### 2. Configure Neon PostgreSQL Database
Create a `.env` file in the project root and add your Neon connection string:
```env
DATABASE_URL="postgresql://username:password@ep-host.region.neon.tech/dbname?sslmode=require"
```

### 3. Generate Prisma Client & Push Schema
Run the following commands to compile the Prisma schema and create the tables in your Neon PostgreSQL database:
```bash
# Generate Prisma Client typings
npx prisma generate

# Push schema directly to Neon DB
npx prisma db push
```

### 4. Run the Development Server
Start the local Next.js server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the app.

---

## App Features & Evaluation Walkthrough

1. **One-Click Local CSV Import:** Reads `expenses_export.csv` directly from the server, runs the dry-run parser, and displays the **Anomaly Resolution Center**.
2. **Anomaly Resolution Center:** 
   - **Meera's Duplicate Review:** Displays exact duplicates (e.g., Marina Bites) and double-logged conflicts (e.g., Thalassa Dinner) side-by-side. Lets the user approve deletions or choose the winning record.
   - **Interactive Payer Mapping:** If a row is missing a payer (e.g., Row 13), the user can assign it via a dropdown.
   - **Priya's USD Converter:** Adjust the exchange rate in real-time, instantly converting USD rows to INR.
   - **Split Validation & Rescaling:** Auto-corrects percentage splits that sum to 110% by rescaling them proportionally to 100%.
3. **Aisha's Simplify Debts Card:** Implements a debt-simplification algorithm that matches debtors and creditors, reducing flatmate settlements to the absolute minimum number of direct transactions.
4. **Rohan's Audit Trail ("No Magic Numbers"):** Generates a complete transaction ledger for any chosen member. Every single expense they paid or owed is listed line-by-line, showing original currencies, conversion rates, and net balance effects.
5. **Timeline Membership Enforcement:** sam joined mid-April and Meera left end of March. The database structure validates split members against their active timeline, ensuring Sam does not pay for March costs, and Meera is not billed for April rent.

---

## Documentation Index (MD Files)
Additional project documentation is located in the root folder:
- [SCOPE.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/SCOPE.md) — Anomaly logs, database schemas, and data resolution rules.
- [DECISIONS.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/DECISIONS.md) — Architectural decisions, options considered, and why.
- [AI_USAGE.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/AI_USAGE.md) — AI tools, key prompts, errors caught, and how they were corrected.
- [SKILL.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/skill.md) — AI coding assistant skill descriptor.
- [DESIGN.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/design.md) — Theme, color guidelines, and styling structures.
- [WORKFLOW.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/workflow.md) — Interactive user journeys and flowcharts.
- [HOSTING.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/hosting.md) — Vercel and Neon deployment manual.
- [ACTION.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/action.md) — Action logs of development milestones.
- [FOLDER_STRUCTURE.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/folder_structure.md) — Folder layout and files breakdown.
- [PROMPTS.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/prompts.md) — Development prompts library.
- [RULES.md](file:///c:/Users/Akshay Pratap Singh/Downloads/assignment/rules.md) — Project development absolute rules.
