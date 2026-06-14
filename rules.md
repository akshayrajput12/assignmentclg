# RULES.md — Coding Rules & Guidelines

This document outlines the absolute development rules followed during the implementation of the Shared Expenses App.

---

## 1. Database Integrity Rules
1. **Relational Constraints Only:** No flat files or JSON columns for primary transaction records. Use distinct relational tables (`User`, `Group`, `GroupMember`, `Expense`, `ExpenseSplit`, `Payment`) managed via Prisma.
2. **Transactional Database Syncing:** All CSV data commits must run inside a database transaction (`prisma.$transaction`) to prevent partial, corrupted, or duplicate imports.
3. **Timeline-Restricted Splits:** splits must respect flatmate timeline durations. Sam cannot participate in splits before April 15, 2026. Meera cannot participate in splits after March 31, 2026.

---

## 2. API Contract Rules
4. **Asynchronous Params Resolver:** Dynamic Route handlers (e.g. `/api/balances/ledger/[name]`) must await dynamic parameters (`Promise<{ name: string }>`) to comply with Next.js 16/React 19 specifications.
5. **JSON Payloads:** All endpoints must receive and respond with standardized JSON objects. Proper error handlers must capture runtime database errors and return HTTP 500/400 codes.

---

## 3. CSV Normalization Rules
6. **Currency Standardization:** The system will calculate and store balances strictly in **INR**. Any non-INR items (USD rows) must be converted using the exchange rate parameter before calculating splits.
7. **Proportional Split Rescaling:** Percentage splits must sum to exactly **100%**. If a CSV row exceeds this limit (e.g., Row 15 sums to 110%), the parser must scale each percentage proportionally to sum to 100% rather than crashing.
8. **Alias Casing Alignment:** Name strings must be trimmed, case-normalized, and aliases resolved (e.g., `Priya S` to `Priya`, `rohan ` to `Rohan`, `priya` to `Priya`).
9. **Refund Processing:** Negative amounts in the CSV must be parsed as negative costs (reducing balances) rather than being flagged as invalid values or absolute figures.
