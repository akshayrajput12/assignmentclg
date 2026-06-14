import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  NormalizedExpense,
  Anomaly,
  MEMBER_TIMELINES,
  STANDARD_MEMBERS,
} from "@/lib/parser";

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { expenses, skippedRows, resolvedAnomalies, anomalies } =
      (await req.json()) as {
        expenses: NormalizedExpense[];
        skippedRows: number[];
        resolvedAnomalies: {
          [anomalyId: string]: { approved: boolean; action: string };
        };
        anomalies: Anomaly[];
      };

    if (!expenses || !Array.isArray(expenses)) {
      return NextResponse.json(
        { error: "Expenses list is required" },
        { status: 400 }
      );
    }

    // Filter out skipped rows
    const activeExpenses = expenses.filter(
      (exp) => !skippedRows.includes(exp.rowNumber)
    );

    // ── Begin raw SQL transaction ───────────────────────────────────────────
    await client.query("BEGIN");

    // 1. Wipe existing data for a fresh import
    await client.query(`DELETE FROM "ExpenseSplit"`);
    await client.query(`DELETE FROM "Expense"`);
    await client.query(`DELETE FROM "Payment"`);
    await client.query(`DELETE FROM "GroupMember"`);
    await client.query(`DELETE FROM "Group"`);
    await client.query(`DELETE FROM "User"`);

    // 2. Collect all unique user names
    const allUserNames = new Set<string>();
    STANDARD_MEMBERS.forEach((n) => allUserNames.add(n));
    activeExpenses.forEach((exp) => {
      if (exp.paidBy) allUserNames.add(exp.paidBy);
      exp.splitWith.forEach((n) => allUserNames.add(n));
    });

    // Insert users and build name→id map
    const dbUsers: Record<string, string> = {}; // name → uuid
    for (const name of allUserNames) {
      const res = await client.query(
        `INSERT INTO "User" (id, name, "createdAt")
         VALUES (gen_random_uuid(), $1, NOW())
         RETURNING id`,
        [name]
      );
      dbUsers[name] = res.rows[0].id;
    }

    // 3. Create the group
    const groupRes = await client.query(
      `INSERT INTO "Group" (id, name, "createdAt")
       VALUES (gen_random_uuid(), 'Shared Flat', NOW())
       RETURNING id`
    );
    const groupId: string = groupRes.rows[0].id;

    // 4. Create group memberships with correct join/leave dates
    for (const name of Object.keys(dbUsers)) {
      const timeline = MEMBER_TIMELINES[name];
      const joinedAt = timeline ? new Date(timeline.joined) : new Date("2026-02-01");
      const leftAt =
        timeline && timeline.left ? new Date(timeline.left) : null;

      await client.query(
        `INSERT INTO "GroupMember" (id, "groupId", "userId", "joinedAt", "leftAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [groupId, dbUsers[name], joinedAt.toISOString(), leftAt?.toISOString() ?? null]
      );
    }

    let expenseCount = 0;
    let paymentCount = 0;

    // 5. Insert expenses and payments
    for (const exp of activeExpenses) {
      if (exp.isPayment) {
        const sender = dbUsers[exp.paidBy];
        const recipientName = exp.splitWith[0] || "Aisha";
        const recipient = dbUsers[recipientName];

        if (sender && recipient) {
          await client.query(
            `INSERT INTO "Payment" (id, date, amount, currency, "fromUserId", "toUserId", notes, "createdAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
            [
              new Date(exp.date).toISOString(),
              exp.amount,
              exp.currency || "INR",
              sender,
              recipient,
              exp.notes || exp.description || null,
            ]
          );
          paymentCount++;
        }
      } else {
        const payerId = dbUsers[exp.paidBy];
        if (!payerId) continue;

        const exchangeRate = exp.currency === "USD" ? 83.0 : 1.0;
        const amountInr = exp.amount * exchangeRate;

        const expRes = await client.query(
          `INSERT INTO "Expense"
             (id, "groupId", description, amount, currency, "exchangeRate", "amountInr",
              date, "paidById", "splitType", notes, "isDuplicate", "createdAt")
           VALUES
             (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
           RETURNING id`,
          [
            groupId,
            exp.description,
            exp.amount,
            exp.currency || "INR",
            exchangeRate,
            amountInr,
            new Date(exp.date).toISOString(),
            payerId,
            exp.splitType || "equal",
            exp.notes || null,
            exp.isDuplicate ?? false,
          ]
        );
        const expenseId: string = expRes.rows[0].id;
        expenseCount++;

        // Insert split rows
        for (const [memberName, owedAmount] of Object.entries(
          exp.splitDetails
        )) {
          const memberId = dbUsers[memberName];
          if (!memberId) continue;

          const share =
            exp.splitType === "percentage" || exp.splitType === "share"
              ? owedAmount
              : null;

          await client.query(
            `INSERT INTO "ExpenseSplit" (id, "expenseId", "userId", amount, share)
             VALUES (gen_random_uuid(), $1, $2, $3, $4)
             ON CONFLICT ("expenseId", "userId") DO NOTHING`,
            [expenseId, memberId, owedAmount, share]
          );
        }
      }
    }

    await client.query("COMMIT");
    // ── End transaction ─────────────────────────────────────────────────────

    const result = {
      usersCreated: Object.keys(dbUsers).length,
      expensesCreated: expenseCount,
      paymentsCreated: paymentCount,
    };

    // Write import report to project root
    try {
      const reportPath = path.join(process.cwd(), "import_report.md");
      let md = `# Import Report — FlatSplit.io\n\n`;
      md += `Generated on ${new Date().toLocaleString()}\n\n`;
      md += `## 1. Import Summary\n`;
      md += `- **Total Rows Parsed:** ${expenses.length}\n`;
      md += `- **Rows Successfully Imported:** ${result.expensesCreated + result.paymentsCreated}\n`;
      md += `- **Rows Skipped/Deleted:** ${skippedRows.length}\n`;
      md += `- **Users Registered in DB:** ${result.usersCreated}\n`;
      md += `- **Exchange Rate Applied:** 1 USD = ₹83.00 INR\n\n`;

      md += `## 2. Ingestion Execution Metrics\n`;
      md += `- **Shared Expenses Created:** ${result.expensesCreated}\n`;
      md += `- **Direct Settlements Created (Payments):** ${result.paymentsCreated}\n\n`;

      md += `## 3. Anomaly Log & Actions Taken\n\n`;
      md += `| Row | Severity | Anomaly Type | Description | Resolution / Action Taken |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;

      if (anomalies && Array.isArray(anomalies)) {
        anomalies.forEach((a: Anomaly) => {
          const resolution = resolvedAnomalies?.[a.id];
          let actionText = "";
          if (skippedRows.includes(a.rowNumber)) {
            actionText = "Row Skipped/Deleted (Rejected Duplicate/Conflict)";
          } else if (a.type === "MISSING_PAID_BY") {
            const mappedPayer =
              expenses.find((e) => e.rowNumber === a.rowNumber)?.paidBy ||
              "Unknown";
            actionText = `Payer manually assigned to: **${mappedPayer}**`;
          } else if (resolution) {
            actionText = resolution.approved
              ? `Approved: *${resolution.action}*`
              : `Rejected: Keep Original`;
          } else {
            actionText = a.autoApplied
              ? `Auto-Resolved: *${a.proposedAction}*`
              : `No action taken`;
          }
          md += `| **Row ${a.rowNumber}** | \`${a.severity}\` | \`${a.type}\` | ${a.description} | ${actionText} |\n`;
        });
      } else {
        md += `| — | — | — | No anomalies logged. | — |\n`;
      }

      md += `\n## 4. Roommate Timelines Enforced\n\n`;
      md += `| Member | Joined Flat | Left Flat | Status |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      STANDARD_MEMBERS.forEach((name) => {
        const t = MEMBER_TIMELINES[name];
        const joined = t ? t.joined : "2026-02-01";
        const left = t && t.left ? t.left : "Present";
        const status = left === "Present" ? "Active" : "Inactive (Moved Out)";
        md += `| **${name}** | ${joined} | ${left} | ${status} |\n`;
      });

      fs.writeFileSync(reportPath, md, "utf8");
      console.log(`✅ Import report written to: ${reportPath}`);
    } catch (reportErr) {
      console.error("Failed to write import report:", reportErr);
    }

    return NextResponse.json({ success: true, summary: result, reportFile: "import_report.md" });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    console.error("Error confirming import:", error);
    const message =
      error instanceof Error ? error.message : "Failed to commit data to database";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
