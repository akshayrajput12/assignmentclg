import { prisma } from "./db";

// ---------------------------------------------------------------------------
// Derive row types from Prisma client return types — works with Prisma 7.
// Prisma 7 does not export named model types from "@prisma/client" directly.
// ---------------------------------------------------------------------------

// Types for calculateBalances()
type DbUser = Awaited<ReturnType<typeof prisma.user.findMany>>[number];

type DbExpenseFull = Awaited<
  ReturnType<typeof prisma.expense.findMany<{ include: { splits: true; paidBy: true } }>>
>[number];

type DbExpenseSplit = DbExpenseFull["splits"][number];

type DbPaymentFull = Awaited<
  ReturnType<typeof prisma.payment.findMany<{ include: { fromUser: true; toUser: true } }>>
>[number];

// Types for getMemberLedger()
type DbExpenseLedger = Awaited<
  ReturnType<
    typeof prisma.expense.findMany<{
      include: { paidBy: true; splits: true };
    }>
  >
>[number];

type DbPaymentLedger = Awaited<
  ReturnType<
    typeof prisma.payment.findMany<{
      include: { fromUser: true; toUser: true };
    }>
  >
>[number];

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface MemberBalance {
  name: string;
  totalPaid: number;    // Total amount paid by this user
  totalOwed: number;    // Total amount this user owes (their share of expenses)
  paymentsSent: number; // Total direct payments sent by this user
  paymentsRecv: number; // Total direct payments received by this user
  netBalance: number;   // netBalance = totalPaid - totalOwed + paymentsSent - paymentsRecv
}

export interface SimplifiedPayment {
  from: string;
  to: string;
  amount: number;
}

export interface AuditItem {
  id: string;
  type: "EXPENSE" | "PAYMENT";
  date: string;
  description: string;
  amount: number;        // Original amount
  currency: string;      // INR, USD
  exchangeRate: number;
  totalInr: number;      // Total cost of expense/payment in INR
  paidBy: string;        // Payer
  yourShareInr: number;  // How much you owe for this item
  netEffectInr: number;  // Net change in your balance
}

// ---------------------------------------------------------------------------
// calculateBalances — aggregates totals for every roommate
// ---------------------------------------------------------------------------

export async function calculateBalances() {
  const users = await prisma.user.findMany();
  const expenses = await prisma.expense.findMany({
    include: { splits: true, paidBy: true },
  });
  const payments = await prisma.payment.findMany({
    include: { fromUser: true, toUser: true },
  });

  // Initialize balance map
  const balanceMap: { [userId: string]: MemberBalance & { id: string } } = {};
  users.forEach((u: DbUser) => {
    balanceMap[u.id] = {
      id: u.id,
      name: u.name,
      totalPaid: 0,
      totalOwed: 0,
      paymentsSent: 0,
      paymentsRecv: 0,
      netBalance: 0,
    };
  });

  // Accumulate expense totals
  expenses.forEach((exp: DbExpenseFull) => {
    if (balanceMap[exp.paidById]) {
      balanceMap[exp.paidById].totalPaid += exp.amountInr;
    }
    exp.splits.forEach((split: DbExpenseSplit) => {
      if (balanceMap[split.userId]) {
        balanceMap[split.userId].totalOwed += split.amount;
      }
    });
  });

  // Accumulate settlement totals
  payments.forEach((pay: DbPaymentFull) => {
    if (balanceMap[pay.fromUserId]) {
      balanceMap[pay.fromUserId].paymentsSent += pay.amount;
    }
    if (balanceMap[pay.toUserId]) {
      balanceMap[pay.toUserId].paymentsRecv += pay.amount;
    }
  });

  // Compute final net balances
  const balances: MemberBalance[] = Object.values(balanceMap).map((b) => {
    const netBalance =
      b.totalPaid - b.totalOwed + b.paymentsSent - b.paymentsRecv;
    return {
      name: b.name,
      totalPaid: Math.round(b.totalPaid * 100) / 100,
      totalOwed: Math.round(b.totalOwed * 100) / 100,
      paymentsSent: Math.round(b.paymentsSent * 100) / 100,
      paymentsRecv: Math.round(b.paymentsRecv * 100) / 100,
      netBalance: Math.round(netBalance * 100) / 100,
    };
  });

  return {
    balances,
    simplifiedPayments: simplifyDebts(balances),
  };
}

// ---------------------------------------------------------------------------
// simplifyDebts — Splitwise-style greedy debt minimisation
// ---------------------------------------------------------------------------

function simplifyDebts(balances: MemberBalance[]): SimplifiedPayment[] {
  const debtors = balances
    .filter((b) => b.netBalance < -0.05)
    .map((b) => ({ name: b.name, balance: b.netBalance }))
    .sort((a, b) => a.balance - b.balance);

  const creditors = balances
    .filter((b) => b.netBalance > 0.05)
    .map((b) => ({ name: b.name, balance: b.netBalance }))
    .sort((a, b) => b.balance - a.balance);

  const payments: SimplifiedPayment[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const paymentAmount = Math.min(-debtor.balance, creditor.balance);

    payments.push({
      from: debtor.name,
      to: creditor.name,
      amount: Math.round(paymentAmount * 100) / 100,
    });

    debtor.balance += paymentAmount;
    creditor.balance -= paymentAmount;

    if (Math.abs(debtor.balance) < 0.05) i++;
    if (Math.abs(creditor.balance) < 0.05) j++;
  }

  return payments;
}

// ---------------------------------------------------------------------------
// getMemberLedger — itemised audit trail for a single member (Rohan's view)
// ---------------------------------------------------------------------------

export async function getMemberLedger(
  memberName: string
): Promise<AuditItem[]> {
  const user = await prisma.user.findUnique({ where: { name: memberName } });
  if (!user) return [];

  const ledger: AuditItem[] = [];

  // Expenses where this member is the payer OR has a split entry
  const expenses = await prisma.expense.findMany({
    where: {
      OR: [
        { paidById: user.id },
        { splits: { some: { userId: user.id } } },
      ],
    },
    include: {
      paidBy: true,
      splits: { where: { userId: user.id } },
    },
    orderBy: { date: "asc" },
  });

  expenses.forEach((exp: DbExpenseLedger) => {
    const isPayer = exp.paidById === user.id;
    const mySplit = exp.splits[0];
    const myShareInr = mySplit ? mySplit.amount : 0;
    const paidInr = isPayer ? exp.amountInr : 0;
    const netEffectInr = paidInr - myShareInr;

    ledger.push({
      id: exp.id,
      type: "EXPENSE",
      date: exp.date.toISOString().split("T")[0],
      description: exp.description,
      amount: exp.amount,
      currency: exp.currency,
      exchangeRate: exp.exchangeRate,
      totalInr: exp.amountInr,
      paidBy: exp.paidBy.name,
      yourShareInr: Math.round(myShareInr * 100) / 100,
      netEffectInr: Math.round(netEffectInr * 100) / 100,
    });
  });

  // Payments sent or received by this member
  const payments = await prisma.payment.findMany({
    where: {
      OR: [{ fromUserId: user.id }, { toUserId: user.id }],
    },
    include: { fromUser: true, toUser: true },
    orderBy: { date: "asc" },
  });

  payments.forEach((pay: DbPaymentLedger) => {
    const isSender = pay.fromUserId === user.id;
    const netEffectInr = isSender ? pay.amount : -pay.amount;

    ledger.push({
      id: pay.id,
      type: "PAYMENT",
      date: pay.date.toISOString().split("T")[0],
      description: isSender
        ? `Paid ${pay.toUser.name}`
        : `Received from ${pay.fromUser.name}`,
      amount: pay.amount,
      currency: pay.currency,
      exchangeRate: 1.0,
      totalInr: pay.amount,
      paidBy: pay.fromUser.name,
      yourShareInr: 0,
      netEffectInr: Math.round(netEffectInr * 100) / 100,
    });
  });

  // Sort by date ascending
  return ledger.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}
