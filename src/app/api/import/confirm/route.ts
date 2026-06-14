import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { NormalizedExpense, MEMBER_TIMELINES, STANDARD_MEMBERS } from "@/lib/parser";

export async function POST(req: NextRequest) {
  try {
    const { expenses, skippedRows, resolvedAnomalies } = await req.json() as {
      expenses: NormalizedExpense[];
      skippedRows: number[];
      resolvedAnomalies: { [anomalyId: string]: { approved: boolean; action: string } };
    };

    if (!expenses || !Array.isArray(expenses)) {
      return NextResponse.json(
        { error: "Expenses list is required" },
        { status: 400 }
      );
    }

    // Filter out skipped rows (e.g., duplicates that were rejected/deleted by Meera)
    const activeExpenses = expenses.filter(exp => !skippedRows.includes(exp.rowNumber));

    // Execute database operations in a single Prisma transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Clean up existing tables to support fresh seed/imports
      await tx.expenseSplit.deleteMany({});
      await tx.expense.deleteMany({});
      await tx.payment.deleteMany({});
      await tx.groupMember.deleteMany({});
      await tx.group.deleteMany({});
      await tx.user.deleteMany({});

      // 2. Identify all unique users (standard flatmates + any guests)
      const allUserNames = new Set<string>();
      STANDARD_MEMBERS.forEach(name => allUserNames.add(name));
      
      activeExpenses.forEach(exp => {
        if (exp.paidBy) allUserNames.add(exp.paidBy);
        exp.splitWith.forEach(name => allUserNames.add(name));
        if (exp.isPayment && exp.splitWith.length > 0) {
          allUserNames.add(exp.splitWith[0]); // Recipient of payment
        }
      });

      // Create users in DB
      const dbUsers: { [name: string]: { id: string; name: string } } = {};
      for (const name of allUserNames) {
        const user = await tx.user.create({
          data: { name },
        });
        dbUsers[name] = user;
      }

      // 3. Create the default group
      const group = await tx.group.create({
        data: { name: "Shared Flat" },
      });

      // 4. Create Group Memberships with timelines
      for (const name of Object.keys(dbUsers)) {
        const timeline = MEMBER_TIMELINES[name];
        // Standard timelines for flatmates
        const joinedAt = timeline ? new Date(timeline.joined) : new Date("2026-02-01");
        const leftAt = timeline && timeline.left ? new Date(timeline.left) : null;

        await tx.groupMember.create({
          data: {
            groupId: group.id,
            userId: dbUsers[name].id,
            joinedAt,
            leftAt,
          },
        });
      }

      let expenseCount = 0;
      let paymentCount = 0;

      // 5. Insert expenses & payments
      for (const exp of activeExpenses) {
        if (exp.isPayment) {
          // Direct settlement/payment
          const sender = dbUsers[exp.paidBy];
          const recipientName = exp.splitWith[0] || "Aisha";
          const recipient = dbUsers[recipientName];

          if (sender && recipient) {
            await tx.payment.create({
              data: {
                date: new Date(exp.date),
                amount: exp.amount,
                currency: exp.currency || "INR",
                fromUserId: sender.id,
                toUserId: recipient.id,
                notes: exp.notes || exp.description,
              },
            });
            paymentCount++;
          }
        } else {
          // Shared expense
          const payer = dbUsers[exp.paidBy];
          if (!payer) continue;

          // Convert USD to INR if needed
          const exchangeRate = exp.currency === "USD" ? 83.0 : 1.0;
          const amountInr = exp.amount * exchangeRate;

          const createdExpense = await tx.expense.create({
            data: {
              groupId: group.id,
              description: exp.description,
              amount: exp.amount,
              currency: exp.currency || "INR",
              exchangeRate,
              amountInr,
              date: new Date(exp.date),
              paidById: payer.id,
              splitType: exp.splitType || "equal",
              notes: exp.notes,
              isDuplicate: exp.isDuplicate,
            },
          });

          // Create splits
          for (const [memberName, owedAmount] of Object.entries(exp.splitDetails)) {
            const member = dbUsers[memberName];
            if (member) {
              await tx.expenseSplit.create({
                data: {
                  expenseId: createdExpense.id,
                  userId: member.id,
                  amount: owedAmount,
                  // In percentage/share, we can store raw values if needed
                  share: exp.splitType === "percentage" || exp.splitType === "share" ? owedAmount : null,
                },
              });
            }
          }
          expenseCount++;
        }
      }

      return {
        usersCreated: Object.keys(dbUsers).length,
        expensesCreated: expenseCount,
        paymentsCreated: paymentCount,
      };
    });

    return NextResponse.json({
      success: true,
      summary: result,
    });
  } catch (error: any) {
    console.error("Error confirming import:", error);
    return NextResponse.json(
      { error: error.message || "Failed to commit data to database" },
      { status: 500 }
    );
  }
}
