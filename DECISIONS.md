# DECISIONS.md — Decisions Log

This log documents the significant technical and product design decisions made during the construction of the Shared Expenses App.

---

## Decision 1: Architecture & Directory Structure
- **Option A (Separate frontend and backend repositories):** Deploy React SPA to Vercel and Express API server to Railway/Render.
- **Option B (Monorepo with Next.js App Router):** Serve both API endpoints and React client from a single Next.js project.
- **Chosen Option:** **Option B (Next.js App Router Monorepo)**
- **Reasoning:** Meets the user's explicit request: *"I want to in a one folder only. So, back end inside back end the API should be there and when when we host in Vercel, automatically it's deployed on our website..."* Vercel hosts Next.js serverless functions (APIs) and static frontend assets together under one domain for free. It is simple to maintain, deploys instantly, and avoids CORS configuration overhead.

---

## Decision 2: Database Technology & ORM
- **Option A (NoSQL MongoDB):** Fast to set up, but lacks relational integrity.
- **Option B (Neon Serverless PostgreSQL + Prisma 7 ORM):** Fully relational database.
- **Chosen Option:** **Option B (Neon PostgreSQL + Prisma 7)**
- **Reasoning:** Relational integrity is crucial for transactions, expense splits, and membership history. Next.js serverless functions connect cleanly to Neon serverless database instances using connection pooling. Prisma 7 is the industry-standard TypeScript ORM for query safety. We implemented direct connections via `@prisma/adapter-pg` to match Prisma 7's new driver architecture.

---

## Decision 3: CSV Import & Anomaly Resolution Pipeline
- **Option A (Auto-resolve anomalies silently on import):** Guess missing values and remove duplicates automatically.
- **Option B (Dry-run parser + interactive UI Resolver + Transaction Commit):** Parse the CSV in memory on dry-run, surface anomalies, let the user make active decisions in a GUI, and execute database writes inside a SQL transaction.
- **Chosen Option:** **Option B (Dry-run + UI Resolver)**
- **Reasoning:** Evaluators explicitly mentioned: *"A crashed import and a silent guess are both failing answers."* Additionally, Meera requested: *"Clean up the duplicates — but I want to approve anything the app deletes or changes."* Providing a dry-run API that returns warnings and allows interactive resolving (e.g. mapping missing payers, choosing duplicate winners) ensures data accuracy and fulfills Meera's requirement. Running database writes inside a single Prisma `$transaction` guarantees database consistency (if one record fails, all are rolled back).

---

## Decision 4: Balance Calculation & Debt Simplification
- **Option A (Direct bilateral balances):** If Rohan owes Aisha, Rohan pays Aisha. This leads to redundant round-trips (e.g., Rohan pays Aisha, Aisha pays Priya, Priya pays Rohan).
- **Option B (Simplify Debts Algorithm):** Calculate everyone's net balance, then solve the settlement paths using a greedy matching algorithm (reducing transaction volume).
- **Chosen Option:** **Option B (Simplified Settlement Pathways)**
- **Reasoning:** Fulfills Aisha's request: *"I just want one number per person. Who pays whom, how much, done."* We sum each user's paid amounts, owed shares, and direct payments to compute a single net balance. Matching the largest debtor with the largest creditor iteratively produces the mathematical minimum number of payments to clear all debts.

---

## Decision 5: Rohan's Ledger ("No Magic Numbers")
- **Option A (Display overall balance only):** Shows the balance without transaction history.
- **Option B (Itemized Transaction Ledger):** Track every transaction where the user lent money or was split into. Net balance is mathematically verified by summing the net effects of each item.
- **Chosen Option:** **Option B (Itemized Ledger)**
- **Reasoning:** Fulfills Rohan's request: *"No magic numbers. If the app says I owe ₹2,300, I want to see exactly which expenses make that up."* By querying all database records where the member is either the payer or included in the split, we list dates, descriptions, total cost, their individual share, and the net effect. The sum of these values aligns perfectly with their net balance.

---

## Decision 6: Membership Timelines
- **Option A (Flat member array):** Ignore join/leave dates, split everything among all current members.
- **Option B (Timeline-restricted memberships):** Store memberships with `joinedAt` and `leftAt` dates in a `GroupMember` junction table. Exclude inactive members from splits during import.
- **Chosen Option:** **Option B (Timeline-restricted memberships)**
- **Reasoning:** Fulfills Sam's request: *"I moved in mid-April. Why would March electricity affect my balance?"* Since Meera moved out at the end of March, and Sam moved in mid-April, storing active timelines ensures Sam is not split into March items and Meera is not billed for April rent.

---

## Decision 7: Premium Light Theme SaaS Aesthetics & Typography
- **Option A (Default dark mode theme):** Keep the dark atmospheric colors.
- **Option B (Light-themed editorial dashboard with low-weight fonts):** Apply a slate/white light theme base, thin glass outline borders, custom floating tooltips, and non-bolded/medium-weight Inter display typography.
- **Chosen Option:** **Option B (Light theme + Less bolded typography)**
- **Reasoning:** Explicitly requested by the user: *"make our landing page as the proper calsy fonts... and less bolded fonts and non bolded... and use light theme components and ui"*. We paired Inter (sans-serif display headlines) at a medium 500 font-weight with JetBrains Mono (monospaced data grids) at a 400 weight. Matte-glass containers (`#FFFFFF` with 98% opacity and subtle ambient shadows) replaced the dark slates to create an ultra-clean, technical dashboard look. Reusable tooltips were implemented as pure React floating overlays to avoid bloating dependencies or introducing Next.js 16 hydration mismatches.
