# SCOPE.md — Anomaly Log & Database Schema

This document details the data anomalies discovered in `expenses_export.csv` and how they were handled, followed by the PostgreSQL relational database schema.

---

## 1. CSV Anomaly Log & Handling Policies

The spreadsheet export contains **21 distinct data anomalies** across date formats, amounts, member timelines, duplicate entries, and split calculations. They were handled according to the following policies:

### Category A: Duplicate & Conflict Resolution (Meera's Request)
*Meera's policy: Clean up duplicates, but require manual approval for deletions/changes.*

1. **Row 5 & 6 (Marina Bites Dinner duplicate):**
   - *Anomaly:* Same date (`2026-02-08`), same amount (`3200` INR), same payer (`Dev`), but slightly different descriptions ("Dinner at Marina Bites" vs "dinner - marina bites").
   - *Resolution:* Flags the second row as a duplicate. Displays it in the UI with a toggle. Default action is to skip/delete the duplicate.
2. **Row 24 & 25 (Thalassa Dinner double-logging conflict):**
   - *Anomaly:* Same date (`11/03/2026`) and venue ("Thalassa"), but different amounts (`2400` vs `2450` INR) and different payers (`Aisha` vs `Rohan`). Note on Rohan's row: "Aisha also logged this I think hers is wrong".
   - *Resolution:* Flags both rows as a double-logging conflict. Displays them side-by-side in the UI, letting the user choose the correct row to keep (Option B/Rohan's row is recommended based on notes).

### Category B: Timeline & Membership Violations (Sam & Meera's Requests)
*Timeline policy: Members are only responsible for splits within their active timeline.*

3. **Row 36 (Groceries BigBasket on 2026-04-02):**
   - *Anomaly:* Includes Meera in the split list, even though she moved out on March 31, 2026.
   - *Resolution:* Auto-excludes Meera from the split list, redistributing her share equally among the active members (Aisha, Rohan, Priya).
4. **Sam's Join Date Alignment:**
   - *Anomaly:* Sam moved in mid-April.
   - *Resolution:* Sam is registered with joined date `2026-04-15` and Meera with left date `2026-03-31`. The calculator ensures no March costs affect Sam, and Meera is not charged for April costs (like Row 35: April Rent).

### Category C: Split Math & Structure Normalization
*Math policy: Re-scale splits proportionally to match the total cost.*

5. **Row 15 (Pizza Friday percentage split):**
   - *Anomaly:* Percentages (`30% + 30% + 30% + 20%`) sum to 110% instead of 100%.
   - *Resolution:* Flags the percentage mismatch, and automatically re-scales the percentages proportionally so they sum to 100% (each 30% becomes 27.27%, 20% becomes 18.18%).
6. **Row 32 (Weekend Brunch percentage split):**
   - *Anomaly:* Same as Pizza Friday, percentages sum to 110%.
   - *Resolution:* Re-scales percentages proportionally to sum to 100%.
7. **Row 42 (Furniture for common room):**
   - *Anomaly:* Split type is marked as `equal` but split details are provided (`Aisha 1; Rohan 1; Priya 1; Sam 1` which is a `share` format).
   - *Resolution:* Flags the mismatch, but parses and splits the expense equally.
8. **Row 23 (Non-member guest split):**
   - *Anomaly:* Involves `Dev's friend Kabir` who is not a flatmate.
   - *Resolution:* Creates a guest user account in the database for `Dev's friend Kabir` so the relational database handles the split correctly.

### Category D: Date & Text Casing Normalizations
*Normalization policy: Standardize date formats and clean names.*

9. **Inconsistent Date Formats:**
   - *Anomalies:* Mix of `YYYY-MM-DD` (`2026-02-01`), slash dates `DD/MM/YYYY` (`01/03/2026`), and month-day formats `Mar 14` (missing year).
   - *Resolution:* Parses all formats to JavaScript Date objects. For `Mar 14`, it infers the year as 2026 based on surrounding context.
10. **Row 34 (Ambiguous out-of-order date):**
    - *Anomaly:* Date is `04/05/2026` but is chronologically placed between March 28th and April 1st.
    - *Resolution:* Interprets `04/05/2026` as April 5th (`2026-04-05`) in MM/DD format, matching the sequence and solving the ambiguity.
11. **Name Casing & Spaces:**
    - *Anomalies:* Lowercase `priya` (Row 9), trailing spaces `rohan ` (Row 27), and aliases like `Priya S` (Row 11).
    - *Resolution:* Normalizes to standard casing (`Priya`, `Rohan`) and resolves `Priya S` to `Priya`.

### Category E: Amount & Currency Formatting
*Formatting policy: Standardize currencies in INR and round values.*

12. **Row 7 (Commas in amount):**
    - *Anomaly:* Amount is `"1,200"` in quotes.
    - *Resolution:* Strips commas, parses as `1200.0`.
13. **Row 29 (Spaces in amount):**
    - *Anomaly:* Amount is `" 1450 "`.
    - *Resolution:* Trims spaces, parses as `1450.0`.
14. **Row 10 (Fractional paisa):**
    - *Anomaly:* Amount is `899.995`, which contains fractional paisa.
    - *Resolution:* Rounds amount to 2 decimal places (`900.00`).
15. **Row 28 (Missing currency):**
    - *Anomaly:* Currency is blank for Groceries DMart.
    - *Resolution:* Defaults currency to `INR`.
16. **Row 31 (Zero-amount expense):**
    - *Anomaly:* Amount is `0` INR.
    - *Resolution:* Flags zero expense, imports it as a zero-value transaction.
17. **Row 26 (Negative refund):**
    - *Anomaly:* Amount is `-30` USD.
    - *Resolution:* Flags negative amount, processes it as a balance-reducing refund.
18. **Row 20, 21, 23 (Multi-currency USD):**
    - *Anomaly:* Amounts are logged in USD (`540`, `84`, `150`).
    - *Resolution:* Converts USD to INR at a configurable rate (default 83.0 INR) and stores both original and converted values.

### Category F: Direct Settlements
*Settlement policy: Re-route settlements from shared expenses to direct payments.*

19. **Row 14 (Rohan paid Aisha back 5000):**
    - *Anomaly:* direct repayment logged as a shared expense.
    - *Resolution:* Intercepts and imports it as a direct transaction (Payment) from Rohan to Aisha, bypassing expense split logic.
20. **Row 38 (Sam deposit share 15000):**
    - *Anomaly:* Deposit paid directly to Aisha.
    - *Resolution:* Imports as a direct transaction from Sam to Aisha.

### Category G: Missing Payer (Critical)
21. **Row 13 (House cleaning supplies payer missing):**
    - *Anomaly:* `paid_by` is blank.
    - *Resolution:* Flags as a critical anomaly that blocks database imports. Requires the user to select who paid from a dropdown in the UI.

---

## 2. PostgreSQL Database Schema (Prisma 7)

```prisma
datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(uuid())
  name      String   @unique
  email     String?
  createdAt DateTime @default(now())
  
  // Relations
  memberships GroupMember[]
  expensesPaid Expense[]      @relation("PaidBy")
  splits       ExpenseSplit[]
  paymentsSent Payment[]      @relation("PaidFrom")
  paymentsRecv Payment[]      @relation("PaidTo")
}

model Group {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  
  // Relations
  members   GroupMember[]
  expenses  Expense[]
}

model GroupMember {
  id        String    @id @default(uuid())
  groupId   String
  userId    String
  joinedAt  DateTime  // Supports changing memberships over time
  leftAt    DateTime? // Null if currently in group
  
  // Relations
  group     Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
}

model Expense {
  id           String   @id @default(uuid())
  groupId      String
  description  String
  amount       Float
  currency     String   // INR, USD
  exchangeRate Float    @default(1.0)
  amountInr    Float    // Converted amount standard for balance calculation
  date         DateTime
  paidById     String
  splitType    String   // equal, unequal, percentage, share
  notes        String?
  isDuplicate  Boolean  @default(false)
  createdAt    DateTime @default(now())
  
  // Relations
  group        Group          @relation(fields: [groupId], references: [id], onDelete: Cascade)
  paidBy       User           @relation("PaidBy", fields: [paidById], references: [id], onDelete: Cascade)
  splits       ExpenseSplit[]
}

model ExpenseSplit {
  id        String   @id @default(uuid())
  expenseId String
  userId    String
  amount    Float    // Amount this user owes (INR)
  share     Float?   // Raw share value (percentage or share count)
  
  // Relations
  expense   Expense  @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([expenseId, userId])
}

model Payment {
  id          String   @id @default(uuid())
  date        DateTime
  amount      Float
  currency    String   @default("INR")
  fromUserId  String
  toUserId    String
  notes       String?
  createdAt   DateTime @default(now())

  // Relations
  fromUser    User     @relation("PaidFrom", fields: [fromUserId], references: [id], onDelete: Cascade)
  toUser      User     @relation("PaidTo", fields: [toUserId], references: [id], onDelete: Cascade)
}
```
